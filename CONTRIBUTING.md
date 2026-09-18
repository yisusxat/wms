# Contribuir al WMS

## Configurar el remoto

El repositorio local está inicializado, pero no se inventa una URL remota. Con
la URL oficial del repositorio ejecuta:

```bash
git remote add origin <URL_DEL_REPOSITORIO>
git add .
git commit -m "feat: complete WMS MVP foundation"
git branch -M main
git push -u origin main
```

## Integración local

La prueba `npm run test:integration` necesita `DATABASE_URL` apuntando a un
PostgreSQL de pruebas. Nunca debe apuntar al proyecto InsForge productivo.
GitHub Actions crea automáticamente un PostgreSQL efímero y ejecuta las
migraciones sobre él.
