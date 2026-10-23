# FinPay Database & DBeaver Guide 🐘🐳

Guia prático para rodar o **PostgreSQL 16** via **Docker** e conectar o **DBeaver** para explorar o banco relacional do **FinPay**.

---

## 1. 🚀 Como Iniciar o PostgreSQL no Docker

1. **Abra o Docker Desktop** no seu Windows (aguarde o ícone da baleia ficar verde).
2. No terminal (PowerShell ou VS Code), na pasta do projeto, execute:

```powershell
docker compose up -d
```

3. Para verificar se o container está rodando:

```powershell
docker ps
```
Você verá o container `finpay_postgres` com status `healthy` rodando na porta `5432`.

---

## 2. 🔌 Como Conectar no DBeaver (Passo a Passo)

1. Abra o **DBeaver**.
2. Clique no ícone de tomada ou vá em **Database > New Database Connection**.
3. Selecione **PostgreSQL** e clique em **Next**.
4. Preencha os campos exatamente assim:
   * **Host**: `localhost`
   * **Port**: `5432`
   * **Database**: `finpay_db`
   * **Username**: `finpay_admin`
   * **Password**: `finpay_secret_password`
5. Clique em **Test Connection ...**:
   * *(Se o DBeaver pedir para baixar o driver JDBC do PostgreSQL, clique em "Download" - é automático e gratuito)*.
   * Você verá a mensagem: **Connected!**
6. Clique em **Finish**.

---

## 3. 📊 O que explorar no DBeaver

Na barra lateral esquerda do DBeaver, navegue em:
`finpay_db > Databases > finpay_db > Schemas > public > Tables`

Você verá todas as tabelas criadas:
* `users`: Usuários do sistema.
* `bank_accounts`: Contas e saldos (Nubank, BTG, etc.).
* `categories`: Categorias com ícone e cores.
* `transactions`: Extrato financeiro com tags e status.
* `debt_contracts`: Financiamentos e empréstimos (Price vs SAC).
* `financial_goals`: Metas de investimento com benchmark CDI/Selic.
* `payroll_configs`: Configuração de Holerite CLT.

---

## 4. 🧭 Diagrama Entidade-Relacionamento (ERD)

No DBeaver:
1. Dê um duplo clique na pasta **Tables**.
2. Na aba superior direita, clique na aba **ER Diagram**.
3. O DBeaver irá desenhar todo o diagrama visual com as linhas conectando as chaves estrangeiras (`Foreign Keys`) entre as tabelas!

---

## 5. 💡 Queries SQL Recomendadas para Testar

Abra o editor SQL no DBeaver (**Ctrl + ]** ou botão SQL) e rode estas consultas:

### A. Ver saldo consolidado (View Analítica)
```sql
SELECT * FROM view_user_financial_overview;
```

### B. Extrato de despesas agrupado por categoria
```sql
SELECT 
    c.name AS categoria,
    COUNT(t.id) AS qtd_lancamentos,
    SUM(t.amount) AS total_gasto
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.type = 'expense'
GROUP BY c.name
ORDER BY total_gasto DESC;
```

### C. Simulação de dívidas ativas
```sql
SELECT 
    name AS contrato,
    creditor AS banco,
    amortization_system AS sistema,
    current_balance AS saldo_devedor,
    monthly_payment AS parcela,
    monthly_interest_rate AS taxa_juros_mensal
FROM debt_contracts;
```

---

## 6. 🛑 Como Parar o Container

Quando terminar de estudar ou desenvolver:
```powershell
docker compose stop
```
E para ligar novamente quando quiser:
```powershell
docker compose start
```
*(Seus dados ficam 100% preservados no volume `finpay_postgres_data`)*.
