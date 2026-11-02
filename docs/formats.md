# Supported formats

Parsing is deterministic (regular expressions and fixed rules). No AI service is
involved, and nothing is guessed: a value that cannot be read with certainty is
left empty and highlighted for you to fill in.

## M-Pesa SMS (Kenya)

The message is normalised (whitespace collapsed) and matched against these
formats. Dates are `d/m/yy` with a 12-hour time and are read as Nairobi time.

| Format | Recognised by | Suggested type |
| --- | --- | --- |
| Money received | `… Confirmed. You have received Ksh1,500.00 from NAME 07XXXXXXXX on 2/6/24 at 10:15 AM …` | Money received |
| Sent to a person | `… Ksh1,000.00 sent to NAME 07XXXXXXXX on … Transaction cost, Ksh13.00 …` | Money spent |
| Pay Bill | `… Ksh2,500.00 sent to BUSINESS for account ACCT on …` | Money spent |
| Buy Goods (till) | `… Ksh450.00 paid to SHOP. on …` | Money spent |
| Agent withdrawal | `… on 2/6/24 at 1:00 PM Withdraw Ksh5,000.00 from AGENT …` | Transfer to *Cash held* |
| Agent deposit | `… On 2/6/24 at 2:00 PM Give Ksh1,000.00 cash to AGENT …` | Transfer from *Cash held* |
| Airtime | `… You bought Ksh100.00 of airtime on …` | Money spent |
| Reversal | any message mentioning a reversal; amount read from `Ksh… is credited/debited` | Reversal |

Extracted fields: reference (the 10-character code at the start), date and time,
amount, direction, counterparty name and number (kept private), and the charge
from `Transaction cost, Ksh…` when the message states one. A stated charge of
`Ksh0.00` creates no charge line.

The suggested type is only a suggestion. You confirm or change it (for example
to *Personal* or *Refund*) before saving.

Anything else is "Unrecognised": the reference and date are still picked up if
present, the amount and direction are left blank, and the original message is
saved as evidence once you complete the details.

## M-Pesa statement PDF

One layout is supported: the M-Pesa customer statement with a
**DETAILED STATEMENT** table. Text is extracted with poppler's
`pdftotext -layout`.

What is read:

- Header: `Customer Name`, `Mobile Number`, `Statement Period: 01 Jun 2024 - 30 Jun 2024`.
- Table columns: Receipt No. | Completion Time (`YYYY-MM-DD HH:MM:SS`, Nairobi) |
  Details | Transaction Status | Paid In | Withdrawn | Balance.
- Details that wrap onto the next line are joined to the row.
- Charges are separate rows that share the payment's receipt number (for example
  `Customer Transfer of Funds Charge`). They are matched to separate charge
  records, so a charge is never deducted twice.
- Direction comes from the sign and column of the amount, and is confirmed by the
  running balance: each row's balance must equal the previous balance plus or
  minus its amount. A row that breaks this chain is flagged ("a row may be
  missing or misread") and blocks completing the reconciliation.
- The opening balance is worked out from the oldest row; the closing balance is
  the newest row's balance.

Password-protected statements: M-Pesa sends the password by SMS. Enter it on the
upload form (or when retrying). It is passed to `pdftotext` for the few seconds
it runs and is never written to disk or the database. After a server restart a
locked statement must be retried with the password.

Clear errors are shown for: scanned/image-only PDFs, files that are not PDFs,
wrong or missing passwords, unsupported layouts and empty tables.

### Checking a real statement

The parser was built from the published layout and tested with generated
statements. Before relying on it, check one of your own statements:

```sh
# Prints the period, row counts and balance checks, with every letter and digit masked.
STATEMENT_PASSWORD='from-the-sms' mchango inspect-statement /path/to/statement.pdf
# With Docker:
docker compose cp statement.pdf mchango:/tmp/statement.pdf
docker compose exec -e STATEMENT_PASSWORD='from-the-sms' mchango mchango inspect-statement /tmp/statement.pdf
```

A good result shows `Balance breaks: 0`, `Without direction: 0` and
`Opening/closing known: true/true`. If not, the masked rows show what went wrong
without exposing your data.

A matching file hash only shows that the same file was uploaded before. It does
not prove a statement is genuine.
