# Bundled fonts

Both typefaces are bundled from npm at build time and served from this origin;
no font request ever goes to a third party.

- **Inter Tight** — SIL Open Font License 1.1
  https://github.com/rsms/inter
- **Fraunces** — SIL Open Font License 1.1
  https://github.com/undercasetype/Fraunces

`src/io/pdf/fraunces.ts` contains a subset of Fraunces embedded as base64 for
use inside exported PDFs. The OFL permits embedding in documents.
