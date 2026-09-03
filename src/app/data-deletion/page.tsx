export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 text-gray-800">
      <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
        <h1 className="text-3xl font-bold mb-6">Instruções para Exclusão de Dados</h1>
        
        <p className="mb-4 text-lg">
          No ARDA CRM, nós levamos a sua privacidade a sério. Se você deseja que todos os seus dados sejam removidos de nossos servidores, siga os passos abaixo:
        </p>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 my-6">
          <h2 className="text-lg font-bold text-blue-800 mb-2">Como solicitar a exclusão:</h2>
          <ol className="list-decimal ml-5 text-blue-900 space-y-2">
            <li>Envie um e-mail para <strong>suporte@ardacrm.com</strong> (ou para o e-mail de atendimento da nossa equipe).</li>
            <li>Coloque no assunto do e-mail: <strong>Solicitação de Exclusão de Dados</strong>.</li>
            <li>No corpo do e-mail, informe o número de telefone (com DDI e DDD) ou o e-mail associado à conta que você deseja excluir.</li>
          </ol>
        </div>

        <h2 className="text-xl font-semibold mt-6 mb-3">O que acontece depois?</h2>
        <p className="mb-4">
          Após o recebimento da sua solicitação, nossa equipe de engenharia processará a exclusão completa das suas informações pessoais, histórico de mensagens e dados de conexão em até <strong>7 dias úteis</strong>.
        </p>
        
        <p className="mb-4 text-sm text-gray-500">
          Nota: Uma vez que os dados forem excluídos, a ação é irreversível e o histórico de conversas não poderá ser recuperado.
        </p>
      </div>
    </div>
  );
}
