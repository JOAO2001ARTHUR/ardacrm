export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 text-gray-800">
      <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
        <h1 className="text-3xl font-bold mb-6">Política de Privacidade</h1>
        <p className="mb-4">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
        
        <h2 className="text-xl font-semibold mt-6 mb-3">1. Coleta de Dados</h2>
        <p className="mb-4">O ARDA CRM coleta dados necessários para o funcionamento da integração com o WhatsApp, incluindo informações de perfil, números de telefone e conteúdo de mensagens trafegadas pela plataforma.</p>

        <h2 className="text-xl font-semibold mt-6 mb-3">2. Uso das Informações</h2>
        <p className="mb-4">As informações coletadas são utilizadas exclusivamente para fornecer os serviços de CRM e automação, permitindo a comunicação eficiente entre sua empresa e seus clientes. Não vendemos seus dados para terceiros.</p>

        <h2 className="text-xl font-semibold mt-6 mb-3">3. Integração com a Meta (WhatsApp)</h2>
        <p className="mb-4">Utilizamos os serviços da Meta Platforms, Inc. para o envio e recebimento de mensagens. Ao utilizar nosso sistema, você concorda com as diretrizes e políticas de privacidade da WhatsApp Cloud API.</p>

        <h2 className="text-xl font-semibold mt-6 mb-3">4. Proteção de Dados</h2>
        <p className="mb-4">Adotamos medidas de segurança rígidas para proteger suas informações contra acessos não autorizados e vazamentos de dados.</p>

        <h2 className="text-xl font-semibold mt-6 mb-3">5. Contato</h2>
        <p className="mb-4">Para dúvidas sobre nossa política de privacidade, entre em contato através do e-mail de suporte.</p>
      </div>
    </div>
  );
}
