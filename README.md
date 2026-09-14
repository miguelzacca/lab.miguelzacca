# MIGUEL ZAKALEB FORMULATION LAB

Workspace técnico privado para registrar formulações, manter metadados de ingredientes, conferir relações quantitativas e compor fichas técnicas editoriais. A aplicação usa HTML, CSS e JavaScript nativos no cliente, API Node.js compatível com Vercel Functions, Prisma ORM e um banco PostgreSQL exclusivo do Lab.

A biblioteca pode ser consultada em modo público somente leitura. Alterações, exportação integral do banco e recursos de IA pertencem exclusivamente ao proprietário autenticado. Não há cadastro, recuperação de conta, equipes ou perfis públicos.

> Este produto organiza dados técnicos informados pelo usuário. Ele não prescreve tratamentos, não inventa doses, não define critérios laboratoriais e não gera instruções autônomas de fabricação. Sugestões de IA sempre aparecem como propostas revisáveis antes de qualquer aceite.

## Visão geral

- Biblioteca editorial com busca por título, código, nome técnico, ingrediente, sinônimo, CAS, tag e descrição.
- Editor técnico com visão documental A4 em tempo real.
- Composição, mapa quantitativo, apresentação, acondicionamento, qualidade, metadados de processo, rotulagem, notas, referências e histórico.
- Perfis reutilizáveis de ingredientes, com origem e status de verificação.
- Foto de capa opcional do manipulado, exibível também no documento.
- Cálculos estritamente determinísticos para percentuais, totais de lote e fracionamento.
- Histórico de revisões e restauração sem destruição do histórico anterior.
- Backup JSON com inspeção, conflitos explícitos, mesclagem ou substituição confirmada.
- IA NVIDIA NIM contextual, sem interface de chatbot e sem sobrescrever dados diretamente.
- Sessão privada do proprietário com cookie assinado, sem fluxo de registro.
- Ficha técnica com texto vetorial/selecionável por meio do mecanismo de impressão do navegador.

## Arquitetura

```text
Browser
  -> views / components / store
  -> repositories do cliente
  -> /api
  -> serviços e domínio no servidor
  -> repositories Prisma
  -> PostgreSQL exclusivo do Formulation Lab
```

Diretórios principais:

```text
api/                  Vercel Functions e endpoints locais
prisma/               schema e migrações exclusivas do Lab
public/               shell HTML e ativos públicos gerados
scripts/              build, proteção e verificação do banco
src/css/              sistema visual do workspace e do documento
src/js/app/           inicialização e coordenação da aplicação
src/js/domain/        modelos, cálculos e regras determinísticas
src/js/pdf/           transformação e renderização documental
src/js/repositories/  contratos de acesso usados pelo navegador
src/server/            Prisma, HTTP, IA e repositories de servidor
tests/                 testes automatizados com node:test
```

O navegador nunca acessa Prisma diretamente. PostgreSQL é a fonte de verdade e os repositories preservam uma fronteira clara para futuras mudanças de infraestrutura.

## Requisitos

- Node.js 20 ou superior
- npm
- projeto Vercel `lab.miguelzacca` vinculado ao diretório
- banco Prisma Postgres criado exclusivamente para o Lab
- chave NVIDIA NIM para os recursos de IA
- credenciais privadas do proprietário e segredo de sessão com no mínimo 32 caracteres

## Instalação local

```powershell
npm install
vercel env pull .env.local
npm run prisma:validate
npm run prisma:generate
npm run dev
```

Abra `http://localhost:4173`. O servidor local carrega `.env.local`, entrega os arquivos estáticos e expõe os mesmos handlers usados na Vercel.

Nunca versione `.env.local`. O `.gitignore` ignora arquivos de ambiente e `.env.example` documenta apenas os nomes esperados.

## Variáveis de ambiente

```dotenv
DATABASE_URL=
POSTGRES_URL=
PRISMA_DATABASE_URL=
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
LAB_AUTH_USERNAME=
LAB_AUTH_PASSWORD=
LAB_AUTH_SECRET=
LAB_AUTH_TTL_SECONDS=43200
```

### PostgreSQL

- `DATABASE_URL`: conexão de runtime. Em Prisma Postgres, a aplicação converte o host direto para o host com pooling quando necessário.
- `POSTGRES_URL`: alternativa compatível com a integração de infraestrutura existente.
- `PRISMA_DATABASE_URL`: conexão direta usada pelo Prisma CLI e pelas migrações.

A precedência de migração é `PRISMA_DATABASE_URL`, `POSTGRES_URL` e, por último, `DATABASE_URL`. Nenhuma credencial é codificada no repositório.

### NVIDIA NIM

- `NVIDIA_API_KEY`: segredo lido somente no servidor. A chave nunca é retornada nem enviada ao navegador.
- `NVIDIA_BASE_URL`: endpoint OpenAI-compatible; o padrão é `https://integrate.api.nvidia.com/v1`.
- `NVIDIA_MODEL`: modelo configurável. O padrão adotado é `nvidia/nemotron-3.5-lightning-30b-a3b`.

O backend exige JSON estruturado nas operações de metadados, valida a forma da resposta, limita campos e tamanhos, aplica timeout e retentativa somente para erros transitórios. O cliente recebe propostas `CURRENT` e `SUGGESTED`, com aceite seletivo, rejeição, cópia e regeneração.

### Autenticação privada

- `LAB_AUTH_USERNAME`: identificador único do proprietário.
- `LAB_AUTH_PASSWORD`: senha forte do proprietário.
- `LAB_AUTH_SECRET`: segredo aleatório com pelo menos 32 caracteres usado para HMAC SHA-256. Não reutilize a senha nem um segredo de outro projeto.
- `LAB_AUTH_TTL_SECONDS`: duração opcional da sessão. O padrão é 43.200 segundos (12 horas), com limites de 15 minutos a 7 dias.

O login emite o cookie `mz_lab_session`, assinado e marcado como `HttpOnly` e `SameSite=Lax`; em produção ele também recebe `Secure`. O servidor valida assinatura, expiração, proprietário e origem da requisição. Mutações aceitam apenas `Origin` same-origin em produção, reduzindo risco de CSRF.

Não existe endpoint de registro. As credenciais são definidas exclusivamente pelas variáveis seguras do projeto. O navegador recebe apenas `configured` e `authenticated`; usuário, senha e segredo nunca são devolvidos pela API.

## Banco isolado e segurança de migração

O banco do Formulation Lab deve ser um recurso separado, mesmo que utilize a mesma conta e o mesmo padrão de infraestrutura do Conectei. As URLs de conexão dos dois produtos jamais podem coincidir.

Antes de qualquer migração, execute:

```powershell
npm run db:guard
```

O guardrail confirma:

- vínculo com o projeto Vercel `lab.miguelzacca`;
- host direto oficial do Prisma Postgres;
- ausência de tabelas estranhas ao domínio do Lab;
- identidade do alvo por fingerprint sem imprimir credenciais.

Para aplicar migrações já versionadas:

```powershell
npm run db:guard
npm run db:migrate
```

Para criar uma nova migração durante o desenvolvimento:

```powershell
npm run db:guard
npx prisma migrate dev --name descricao_da_mudanca
```

Não execute `prisma migrate reset`. Não copie a `DATABASE_URL` do Conectei. Não aplique uma migração se o guard não finalizar com `safe: true`.

Depois de migrar, valide escrita, leitura e limpeza de um registro transitório:

```powershell
npm run db:verify
```

## Modelo de dados

Os principais dados pesquisáveis possuem colunas e relações próprias. O schema inclui `Formulation`, `Ingredient`, `FormulationIngredient`, `Collection`, `Tag`, `FormulationTag`, `Revision`, `Reference`, `QualityControlRecord`, `ProcessMetadata`, `LabelingField`, `Packaging`, `DocumentSettings`, `Attachment`, `AppSettings` e `AIInteraction`.

JSON/JSONB fica restrito a estruturas genuinamente flexíveis, como mapas quantitativos, snapshots e configurações extensíveis. IDs usam UUID, datas de criação/alteração são automáticas, relações têm chaves estrangeiras e cascatas são usadas somente para entidades dependentes da formulação.

No runtime serverless, uma única instância de `PrismaClient` é reutilizada pelo cache global de desenvolvimento. O adaptador PostgreSQL usa pool pequeno e timeouts explícitos para evitar explosão de conexões nas Functions.

## API

Endpoints principais:

```text
GET              /api/formulations       público, somente leitura
POST|PUT|DELETE  /api/formulations       proprietário
GET              /api/ingredients        público, somente leitura
POST|PUT         /api/ingredients        proprietário
GET              /api/settings           público, somente leitura
PUT              /api/settings           proprietário
GET|POST          /api/backup             proprietário
GET               /api/health             público
GET               /api/auth/status        público
POST              /api/auth/login         público, same-origin
POST              /api/auth/logout        proprietário, same-origin
POST              /api/ai/*               proprietário
```

Entradas possuem limite de tamanho e validação no servidor. Erros públicos são reduzidos a mensagens recuperáveis; chaves, stack traces e respostas brutas do provedor não são expostas.

## Documento e PDF

A camada `document-model` transforma o registro técnico em um modelo independente da interface. A paginação reserva a primeira página para identificação, composição, mapa quantitativo e apresentação; tabelas extensas continuam em páginas próprias; seções secundárias vazias são omitidas.

O preview usa proporção A4 real, margens editoriais, cabeçalho, rodapé, numeração de página e regras próprias de impressão. `Exportar PDF` utiliza HTML/CSS em mídia de impressão, preservando texto e vetores. Não há captura de tela rasterizada.

Convenção de nome:

```text
MZ-FRM-[CODE]-[slug]-r[revision].pdf
```

A aparência do workspace pode seguir tema claro, escuro ou sistema; o documento permanece com aparência de papel, salvo preferência explícita.

## Backup e restauração

O exportador reúne versão do schema, formulações, ingredientes, coleções e configurações. A importação ocorre em etapas:

1. seleção do JSON;
2. validação estrutural e de limites;
3. resumo de conteúdo;
4. identificação de conflitos por código;
5. escolha explícita entre mesclar, substituir ou cancelar.

Registros inválidos são informados e nunca descartados silenciosamente. O modo `replace` é destrutivo por definição e só deve ser confirmado após a revisão do resumo.

## Desenvolvimento

```powershell
npm run dev
npm run build
```

O build gera Prisma Client e copia os módulos e estilos necessários para `public/assets`. Bibliotecas grandes não são carregadas no primeiro render; a composição PDF aproveita APIs nativas do navegador.

Atalhos do workspace:

- `Ctrl/Cmd + K`: paleta de comandos
- `Ctrl/Cmd + S`: salvar
- `Ctrl/Cmd + P`: visualizar documento
- `Esc`: fechar overlay ativo

## Testes

```powershell
npm test
npm run prisma:validate
npm run prisma:generate
npm run db:verify
```

A suíte automatizada cobre:

- aritmética de composição e conversão de unidades;
- total percentual, lote e fracionamento;
- normalização matemática sem mutação da entrada;
- formato e dígito verificador CAS;
- duplicatas, negativos e valores numéricos inválidos;
- validação e limites do backup;
- parsing e schema de JSON produzido pela IA;
- assinatura, expiração, cookie e proteção same-origin da sessão privada;
- ausência de endpoint de cadastro e contrato somente leitura público;
- transformação e paginação do documento técnico;
- persistência e atualização pelo repository de ingredientes;
- contrato relacional do schema e presença de migração versionada.

`db:verify` complementa os testes unitários com uma prova end-to-end real: cria um registro inofensivo no banco do Lab, lê esse registro e o remove.

## Deploy na Vercel

1. Vincule este diretório somente ao projeto `lab.miguelzacca`.
2. Provisione ou conecte um Prisma Postgres exclusivo para o Lab.
3. Cadastre `DATABASE_URL`, `POSTGRES_URL` e `PRISMA_DATABASE_URL` próprias do Lab em Development, Preview e Production.
4. Cadastre `NVIDIA_API_KEY`, `NVIDIA_BASE_URL` e `NVIDIA_MODEL` no projeto do Lab.
5. Cadastre `LAB_AUTH_USERNAME`, `LAB_AUTH_PASSWORD` e um `LAB_AUTH_SECRET` aleatório e exclusivo em cada ambiente.
6. Execute `npm run db:guard` contra o ambiente que será migrado.
7. Aplique as migrações com `npm run db:migrate`.
8. Faça o deploy somente depois de `npm test`, `npm run build` e `npm run db:verify` concluírem com sucesso.

O `vercel.json` entrega `public` como saída do build e configura durações distintas para Functions comuns e operações de IA.

### Domínio `lab.miguelzacca.dev`

No painel do projeto Lab, adicione `lab.miguelzacca.dev` em Domains. Em seguida, crie no provedor DNS o registro indicado pela Vercel, normalmente um CNAME para subdomínio. Confirme o certificado TLS e defina o domínio como produção apenas no projeto `lab.miguelzacca`.

As consultas publicadas são intencionalmente somente leitura; edição e IA usam a autenticação própria do Lab. Se toda leitura também precisar ser confidencial, habilite adicionalmente Vercel Deployment Protection ou um gateway autenticado. Não dependa do caráter não divulgado da URL como mecanismo de segurança.

## Checklist de produção

- `.env.local` fora do controle de versão.
- banco, URLs e migrações exclusivos do Lab.
- `npm run db:guard` retorna `safe: true`.
- Prisma validado e client gerado.
- testes e build aprovados.
- `db:verify` confirma escrita, leitura e limpeza.
- NVIDIA NIM responde sem expor a chave.
- credenciais e segredo de autenticação existem somente nas variáveis seguras da Vercel.
- leitura pública não permite mutações; login, logout, backup e IA respeitam same-origin.
- backup JSON exportado antes de alterações destrutivas.
- preview A4 conferido em desktop e impressão.
- domínio e TLS ativos no projeto correto.
- acesso privado protegido na borda.
