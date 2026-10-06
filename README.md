# Plataforma de Gestão para Escolas de Natação

Aplicação Next.js com Supabase para várias escolas, com dados separados por organização e políticas RLS.

## Módulos

- **Base:** autenticação, escolas, usuários, alunos, responsáveis, professores e vínculos.
- **Operação:** piscinas, raias, turmas, horários, calendário e presença.
- **Pedagógico:** níveis, habilidades, avaliações e histórico do aluno.
- **Financeiro:** planos, mensalidades, pagamentos, inadimplência e relatórios.
- **Experiência do cliente:** portal do responsável, pedidos de reposição, aulas experimentais e comunicados internos.
- **Automação:** QR de presença, indicadores, conexão Mercado Pago por escola, PIX com conciliação e lembretes por WhatsApp autorizados.

O portal exige e-mail confirmado que corresponda ao cadastro do responsável. A escola aprova o pedido de acesso no painel; apenas o responsável financeiro vê mensalidades. Reposições e experimentais dependem da análise da secretaria e de vagas na aula escolhida. Uma aula com visita confirmada não pode ser cancelada antes de resolver a reserva. As aulas experimentais aparecem na lista da aula, mas sua conclusão é registrada no módulo de atendimento; o prospecto ainda não é aluno matriculado.

## Execução local

1. Instale Node.js e execute `npm ci`.
2. Copie `.env.example` para `.env.local` e configure a URL do Supabase e a chave pública. Nunca exponha uma chave `service_role`.
3. No projeto Supabase já conectado (`zdlijvntrbgfzdaqfhqg`), as migrações da pasta `database/` já foram aplicadas. Para um novo projeto, aplique as migrações na ordem de dependências das fases; revise e teste antes de usar dados reais.
4. Execute `npm run dev` e abra `http://localhost:3000/login`.

Configure **Authentication → URL Configuration** do Supabase com o URL de produção `https://saas-aen.vercel.app` como Site URL e adicione os URLs de desenvolvimento necessários à lista de redirecionamentos. Isso garante que o link de confirmação do cadastro do responsável retorne ao ambiente certo.

Para começar a usar o portal, cadastre o e-mail no registro do responsável, vincule-o ao aluno e peça ao responsável para criar uma conta com o mesmo endereço em `/cadastro`. Depois da confirmação por e-mail, ele solicita acesso em `/portal/acesso`; um administrador aprova em **Portal do responsável** no painel da escola.

## Verificação

Execute `npm run typecheck`, `npm run lint` e `npm run build`. O ambiente de execução gerenciado pode falhar dentro do Next.js ao ler `tsc --showConfig`; nesse ambiente, rode a checagem de tipos separadamente e `CODEX_BUILD_WORKAROUND=1 npm run build` para verificar a compilação. A configuração normal de produção mantém a checagem de tipos no build.

Antes de usar com clientes, teste com duas escolas e contas distintas: a conta de uma escola não deve ler dados da outra; responsável sem aprovação não deve ver o aluno; responsável não financeiro não deve ver mensalidades; reposição e experimental não devem ultrapassar a capacidade da turma. Consulte os registros de auditoria e mantenha backups do banco.

## Ativar as integrações externas

Os fluxos de QR Code e indicadores não exigem chaves externas. As ações de PIX e WhatsApp ficam desativadas até configurar as variáveis de `.env.example` como segredos de servidor na Vercel. Nunca use `NEXT_PUBLIC_` em tokens privados. Gere `MP_TOKEN_ENCRYPTION_KEY` com 32 bytes aleatórios em base64 e mantenha a mesma chave em todos os deploys; trocar a chave sem migrar os dados torna os tokens das escolas ilegíveis.

Crie uma aplicação Mercado Pago para a plataforma e configure exatamente `https://saas-aen.vercel.app/api/mercado-pago/callback` como URL de redirecionamento. Configure o evento **payment** na URL `https://saas-aen.vercel.app/api/mercado-pago/webhook` e salve a assinatura secreta em `MP_WEBHOOK_SECRET`. Cada administrador conecta a conta vendedora da própria escola em **Mercado Pago**. O responsável financeiro gera um PIX após informar o CPF do pagador; o CPF é enviado ao provedor e não é armazenado neste banco. O webhook valida a assinatura e consulta o pagamento no provedor antes de registrar a baixa. Se um pagamento externo chegar quando a mensalidade já estiver quitada, a cobrança entra em **análise** para conferência da escola.

Para WhatsApp, configure a Cloud API da Meta e um modelo **pt_BR aprovado sem parâmetros** em `WHATSAPP_REMINDER_TEMPLATE`. O responsável precisa autorizar o número cadastrado no portal. A secretaria envia cada lembrete manualmente a partir do painel, no máximo uma tentativa por responsável e mensalidade por dia. O registro `sent` indica aceitação pela API; não representa confirmação de entrega ou leitura. Não envie mensagens de teste a clientes reais.

Revise os cadastros, o consentimento e os ambientes de teste do Mercado Pago e da Meta antes de habilitar produção. Sem credenciais dessas plataformas, o fluxo de cobrança e envio externo não pode ser verificado ponta a ponta.
