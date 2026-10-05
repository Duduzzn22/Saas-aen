# Plataforma de Gestão para Escolas de Natação

Início da **Fase 1 — Base**, seguindo o planejamento de seis fases. Este repositório contém uma aplicação Next.js com Supabase Auth, cadastros iniciais e um esquema SQL preparado para separar organizações.

## Entregue neste primeiro incremento

- Login por e-mail e senha; sessão com cookies e verificação de token no servidor.
- Seleção da escola vinculada ao usuário; papéis `admin`, `reception` e `teacher` por escola.
- Cadastro e listagem de alunos, responsáveis e professores; vínculo entre aluno e responsável.
- Autorização na aplicação e RLS nas tabelas, com `organization_id` e chaves compostas para impedir vínculos entre escolas.
- Auditoria de inclusões e alterações nos três cadastros principais.
- Layout adaptado a celular e desktop.

O professor tem acesso ao painel, mas turmas e chamada pertencem à Fase 2. A gestão de convites, edição de registros, importação de planilhas, backups e validação com uma escola real ainda estão pendentes nesta fase. O SQL é um **rascunho de implantação**, não foi aplicado a um banco neste ambiente.

## Executar localmente

Requer Node.js 20.9+ e um projeto Supabase de desenvolvimento.

1. `npm ci`
2. Copie `.env.example` para `.env.local` e preencha a URL do projeto e a **publishable key** obtidas no painel Supabase. Nunca adicione uma chave `service_role` ao frontend.
3. Revise `database/phase1_foundation.sql`. Crie uma migração pelo Supabase CLI (`supabase migration new phase1_foundation`) no seu ambiente e copie o SQL para o arquivo gerado. Aplique primeiro em um projeto de teste.
4. Crie um usuário em **Authentication > Users** no painel Supabase. Confirme o e-mail conforme as configurações do projeto.
5. No SQL Editor, crie a primeira organização e o vínculo administrativo, substituindo os valores de exemplo:

```sql
insert into public.organizations(name,slug)
values ('Escola Piloto','escola-piloto')
returning id;

-- Use o id retornado acima e o UUID do usuário de Authentication > Users.
insert into public.memberships(organization_id,user_id,full_name,role)
values ('UUID_DA_ORGANIZACAO','UUID_DO_USUARIO','Administrador','admin');
```

6. `npm run dev` e acesse `http://localhost:3000/login`.

Para adicionar outro membro nesta etapa, crie a conta em Authentication e insira um vínculo `memberships` pelo SQL Editor. Esta operação é administrativa; os clientes da aplicação não recebem permissão de escrita nessa tabela.

## Verificações antes de usar dados reais

1. Crie duas organizações de teste com usuários diferentes. Faça login em cada uma e confirme que só aparece sua própria escola.
2. Com a conta da escola A, tente consultar/inserir uma linha da escola B pela Data API. O RLS deve impedir o acesso mesmo se alguém manipular o `organization_id` do formulário.
3. Faça login como `reception` e confirme que o cadastro de professores falha; como `teacher`, confirme que os cadastros administrativos não abrem.
4. Cadastre um aluno e um responsável da escola A; tente vinculá-los a registros da escola B. As chaves compostas devem rejeitar a operação.
5. Confira os registros de `audit_logs` após criar e alterar um cadastro. Teste restauração do projeto antes da implantação piloto.

Rode `npm run typecheck`, `npm run lint` e `npm run build` antes de publicar. Configure backups, domínio e implantação apenas após aprovar a escola piloto e revisar as políticas. O fluxo de recuperação de senha e convites administrativos será adicionado no próximo incremento da Fase 1.

## Próxima entrega da Fase 1

- Convites de usuários e vínculo seguro a uma escola.
- Edição e inativação de cadastros com trilha de auditoria.
- Ficha detalhada do aluno e do responsável, com dados mínimos necessários ao piloto.
- Testes reais de RLS em dois locatários, importação inicial e rotina de backup.
