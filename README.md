# Plataforma de Gestão para Escolas de Natação

Início da **Fase 1 — Base**, seguindo o planejamento de seis fases. Este repositório contém uma aplicação Next.js com Supabase Auth, cadastros iniciais e um esquema SQL preparado para separar organizações.

## Fase 1 — Base

- Login por e-mail e senha; sessão com cookies e verificação de token no servidor.
- Seleção da escola vinculada ao usuário; papéis `admin`, `reception` e `teacher` por escola.
- Cadastro e listagem de alunos, responsáveis e professores; vínculo entre aluno e responsável.
- Autorização na aplicação e RLS nas tabelas, com `organization_id` e chaves compostas para impedir vínculos entre escolas.
- Auditoria de inclusões e alterações nos três cadastros principais.
- Layout adaptado a celular e desktop.

O professor vinculado a uma conta de membro pode acessar suas turmas e chamadas. A gestão de convites, importação de planilhas, backups e validação com uma escola real ainda estão pendentes. Edição e inativação de alunos, responsáveis e professores já estão disponíveis. O esquema SQL foi aplicado ao projeto Supabase da escola piloto Aquafit Lidice.

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

Rode `npm run typecheck`, `npm run lint` e `npm run build` antes de publicar. Configure backups e revise as políticas antes de usar dados reais. O fluxo de recuperação de senha e convites administrativos será adicionado no próximo incremento da Fase 1.

## Próxima entrega da Fase 1

- Convites de usuários e vínculo seguro a uma escola.
- Revisão do fluxo de edição e inativação com a escola piloto.
- Ficha detalhada do aluno e do responsável, com dados mínimos necessários ao piloto.
- Testes reais de RLS em dois locatários, importação inicial e rotina de backup.

## Publicação na Vercel

O projeto `saas-aen` está conectado ao ramo `main` deste repositório. Em **Project Settings > Environment Variables**, configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para **Production**. O arquivo `.env.local` é apenas para desenvolvimento local e não é enviado ao deploy. Após mudar as variáveis, faça um novo deploy para que a versão publicada as receba.

O endereço de produção é https://saas-aen.vercel.app/. No Supabase Auth, inclua esse endereço como Site URL e configure os Redirect URLs pertinentes quando os fluxos de confirmação de e-mail e recuperação de senha forem usados.

## Fase 2 — Operação

Piscinas e raias são cadastradas pelo administrador. Administração e recepção criam turmas, vinculam professores, definem capacidade, horários semanais e matrículas. O calendário mostra automaticamente os horários recorrentes em qualquer semana; cada aula é gravada quando a chamada é aberta, sem duplicar ocorrências existentes. A chamada registra presença, ausência ou justificativa por aluno; aulas podem ser canceladas. Professores com conta vinculada veem apenas suas turmas e podem fazer a chamada.

Em um projeto novo, aplique `database/phase1_foundation.sql` e depois, nesta ordem, `database/phase2_operations.sql`, `database/phase2_indexes.sql` e `database/phase2_relations.sql`. No projeto piloto, estas migrações já foram aplicadas. A agenda semanal impede sobreposição na mesma raia, e matrículas respeitam a capacidade da turma. O professor precisa de uma conta Auth, de um vínculo `memberships` com papel `teacher` e de um vínculo ao cadastro de professor na interface.

Para mudar um horário, desative o antigo e cadastre outro. Aulas já abertas preservam a data, o horário e a presença. Piscinas, raias e turmas podem ser editadas e inativadas após desativar os horários ativos; a capacidade não pode cair abaixo do número de matrículas ativas.\n\nAplique também `database/phase2_schedule_management.sql` após as três migrações da Fase 2. No projeto piloto, ela já foi aplicada. Férias, reposições e exceções por data ainda pertencem a incrementos seguintes.

## Fase 3 — Pedagógico

O administrador configura níveis ordenados e habilidades por escola. Na ficha do aluno, administração e professores de turmas com matrícula ativa podem atribuir um novo nível e registrar avaliações por habilidade. Recepção pode consultar o histórico, sem alterar avaliações. Cada avaliação registra todos os resultados em uma transação, preservando versões anteriores; a mudança de nível é registrada em histórico e não ocorre automaticamente.

Em um projeto novo, após as migrações das fases anteriores, aplique `database/phase3_pedagogy.sql` e `database/phase3_level_guard.sql`. No projeto piloto, elas já foram aplicadas. O acesso do professor depende de sua conta estar vinculada ao cadastro de professor e de uma matrícula ativa do aluno em sua turma.

## Fase 4 — Financeiro

O administrador configura planos mensais em BRL e o dia de vencimento (1 a 28). Administração e recepção vinculam alunos, geram mensalidades sob demanda e registram pagamentos recebidos manualmente. O valor e o nome do plano ficam gravados na mensalidade; mudar o plano depois não reescreve cobranças anteriores. O relatório mensal mostra faturado, recebido, saldo aberto e vencido. Pagamentos parciais são aceitos até o saldo total. O administrador pode estornar um lançamento com motivo e cancelar a mensalidade depois dos estornos.

Aplique `database/phase4_finance.sql` e depois `database/phase4_reporting.sql` após as migrações da Fase 3. No projeto piloto, elas já foram aplicadas. A geração não é automática: confira os vínculos e clique em **Gerar mensalidades do mês**. Não há prorrata quando o aluno inicia ou troca de plano no meio do mês. Lançamentos identificados como PIX ou cartão são registros manuais de dinheiro já recebido; a integração de cobrança fica para a Fase 6. Vínculos atuais não guardam a vigência histórica de cada plano, portanto revise cuidadosamente cobranças de meses anteriores ao alterar um plano.
