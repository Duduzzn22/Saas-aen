# Plataforma de Gestão para Escolas de Natação

Aplicação Next.js com Supabase para várias escolas, com dados separados por organização e políticas RLS.

## Módulos

- **Base:** autenticação, escolas, usuários, alunos, responsáveis, professores e vínculos.
- **Operação:** piscinas, raias, turmas, horários, calendário e presença.
- **Pedagógico:** níveis, habilidades, avaliações e histórico do aluno.
- **Financeiro:** planos, mensalidades, pagamentos, inadimplência e relatórios.
- **Experiência do cliente:** portal do responsável, pedidos de reposição, aulas experimentais e comunicados internos.

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

## Próxima fase

As integrações externas de pagamento, WhatsApp, QR Code e dashboards avançados pertencem à Fase 6.
