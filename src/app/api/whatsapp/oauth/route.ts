import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Código OAuth não fornecido' }, { status: 400 });
    }

    // 1. Trocar o 'code' pelo Access Token da Meta
    const tokenUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token');
    tokenUrl.searchParams.append('client_id', (process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID) || '');
    tokenUrl.searchParams.append('client_secret', process.env.META_APP_SECRET || '');
    tokenUrl.searchParams.append('code', code);
    
    // ATENÇÃO: O redirect_uri deve ser vazio no Embedded Signup v4 via SDK
    tokenUrl.searchParams.append('redirect_uri', ''); 

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Erro ao trocar token:', tokenData);
      return NextResponse.json({ error: 'Falha na troca de credenciais com a Meta' }, { status: 400 });
    }

    const accessToken = tokenData.access_token;

        // 2. Extrair o WABA ID do token usando debug_token (Recomendado para Embedded Signup)
    const appToken = `${(process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID)}|${process.env.META_APP_SECRET}`;
    const debugRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${accessToken}&access_token=${appToken}`);
    const debugData = await debugRes.json();
    
    let wabaId = null;
    if (debugData.data && debugData.data.granular_scopes) {
      const waScope = debugData.data.granular_scopes.find((s: any) => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging');
      if (waScope && waScope.target_ids && waScope.target_ids.length > 0) {
        wabaId = waScope.target_ids[0];
      }
    }

    if (!wabaId) {
      return NextResponse.json({ error: 'Nenhuma Conta do WhatsApp Business encontrada.' }, { status: 404 });
    }

    // 3. Buscar o ID do Número de Telefone vinculado ao WABA
    const phoneRes = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}`);
    const phoneData = await phoneRes.json();
    
    if (!phoneData.data || phoneData.data.length === 0) {
      return NextResponse.json({ error: 'Nenhum número de telefone encontrado.' }, { status: 404 });
    }
    const phoneNumberId = phoneData.data[0].id;

    // 4. Descobrir qual o Account ID da empresa logada no CRM
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'Empresa não encontrada no sistema' }, { status: 404 });
    }

    // 5. Salvar na whatsapp_config (com o token devidamente criptografado)
        // 5. Opcional mas recomendado: Inscrever nosso App nos Webhooks do WABA
    try {
      await fetch(`https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
    } catch(e) {}

    const encryptedToken = encrypt(accessToken);
    const verifyToken = encrypt(`arda_${profile.account_id}`); // Token de webhook gerado automaticamente
    
    const payload = {
      account_id: profile.account_id,
        user_id: user.id,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token: encryptedToken,
      verify_token: verifyToken,
        status: 'connected',
        registered_at: new Date().toISOString(),
        subscribed_apps_at: new Date().toISOString(),
      };

    const { error: upsertError } = await supabase
      .from('whatsapp_config')
      .upsert(payload, { onConflict: 'account_id' });

    if (upsertError) throw upsertError;

    return NextResponse.json({ 
      success: true, 
      message: 'WhatsApp conectado com sucesso!',
      wabaId, 
      phoneNumberId 
    });

  } catch (error) {
    console.error('Erro crítico no OAuth:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}








