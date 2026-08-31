# MR Fábregas POS

Aplicación Express para administrar equipos de metrología en PostgreSQL.

## Variables requeridas

Configure estas variables en Production, Preview y Development:

- `DATABASE_URL`: cadena de conexión PostgreSQL de Neon.
- `ADMIN_USERNAME`: usuario administrador.
- `ADMIN_CONTRASENA`: contraseña del administrador.
- `AUTH_SECRET`: secreto aleatorio largo para firmar sesiones.

La tabla `equipments` se crea automáticamente al iniciar. Use una integración de Neon desde Vercel Marketplace para crear la base de datos y asignar `DATABASE_URL`; Vercel Postgres dejó de ser un producto propio y las bases existentes migraron a Neon en diciembre de 2024.
