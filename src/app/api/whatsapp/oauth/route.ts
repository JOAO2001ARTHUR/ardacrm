import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
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
    tokenUrl.searchParams.append('client_id', process.env.META_APP_ID || '');
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

    // 2. Buscar as Contas de WhatsApp (WABA) liberadas pelo cliente
    const wabaRes = await fetch(`https://graph.facebook.com/v20.0/me/client_whatsapp_business_accounts?access_token=${accessToken}`);
    const wabaData = await wabaRes.json();
    
    if (!wabaData.data || wabaData.data.length === 0) {
      return NextResponse.json({ error: 'Nenhuma Conta do WhatsApp Business encontrada.' }, { status: 404 });
    }
    const wabaId = wabaData.data[0].id;

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
    const encryptedToken = encrypt(accessToken);
    const verifyToken = encrypt(`arda_${profile.account_id}`); // Token de webhook gerado automaticamente
    
    const payload = {
      account_id: profile.account_id,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token_encrypted: encryptedToken,
      verify_token_encrypted: verifyToken,
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
