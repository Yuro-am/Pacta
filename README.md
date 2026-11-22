# PACTA

Una app de deudas entre amigos. Registrad gastos y acordad cómo saldarlos con dinero, comida, bebidas, favores o recompensas.

## Desarrollo

Necesitas Node.js 20.9 o posterior y npm.

```sh
npm ci
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

La demo guarda los cambios en el almacenamiento local del navegador. Usa «Añadir» o «Nueva deuda» para registrar una deuda. Abre el movimiento para enviar una propuesta, simular su aceptación y confirmar que se ha cumplido el acuerdo. El saldo se actualiza al saldar la deuda. Para restaurar los datos de ejemplo, borra el almacenamiento local del sitio.

No se necesitan credenciales de Supabase. Esta fase todavía no sincroniza datos entre personas ni procesa pagos reales.

## Comprobaciones

```sh
npm run typecheck
npm run build
```

`npm start` arranca la compilación de producción.

## Publicar con GitHub y Vercel

1. Sube el proyecto a la rama `main` de [Yuro-am/Pacta](https://github.com/Yuro-am/Pacta). Para la primera subida, ejecuta lo siguiente desde la carpeta del proyecto con una cuenta que tenga permiso de escritura en el repositorio.

   ```sh
   git add .gitignore README.md app lib next.config.ts package.json package-lock.json postcss.config.mjs tsconfig.json
   git commit -m "Preparar PACTA para publicar en Vercel"
   git push origin HEAD:main
   ```

2. En [Vercel](https://vercel.com/new), inicia sesión con GitHub, selecciona **Add New → Project** si estás en el panel e importa **Yuro-am/Pacta**. Si el repositorio no aparece, concede acceso a Pacta a la integración de GitHub de Vercel.
3. En **Configure Project**, selecciona **Next.js** como **Framework Preset** y deja **Root Directory** en la raíz del repositorio. Conserva los comandos detectados por Vercel y el directorio de salida predeterminado. Usa **Node.js 24.x** en los ajustes del proyecto si necesitas elegir la versión. La demo funciona con el apartado **Environment Variables** vacío.
4. Pulsa **Deploy**. Cuando aparezca **Ready**, abre el proyecto y copia su dominio de producción en **Settings → Domains**, o pulsa **Visit** en el despliegue de producción. Abre el enlace HTTPS que termina en `.vercel.app` desde el ordenador o el móvil.

Vercel vuelve a desplegar la aplicación cuando subes cambios a la rama de producción `main`. Usa el mismo dominio de producción para conservar los datos guardados en ese navegador. Cada navegador y cada dominio mantienen sus propios datos, así que el móvil y el ordenador comienzan con datos de ejemplo por separado.

## Configurar Supabase

Copia `.env.example` a `.env.local`. En el panel de tu proyecto Supabase, abre **Connect** y rellena `NEXT_PUBLIC_SUPABASE_URL` con la URL del proyecto y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con la clave **Publishable**. Si despliegas en Vercel, añade las mismas variables en **Settings → Environment Variables** y vuelve a desplegar.

Estas variables son públicas. Guarda las claves secretas y de tipo `service_role` fuera del cliente. Git ignora `.env.local`.

La integración prepara los clientes de navegador y servidor y la renovación de sesiones mediante el proxy de Next.js. Si falta alguna de las dos variables, el proxy deja pasar las solicitudes y los clientes devuelven `null`. La demo sigue usando el almacenamiento local con o sin Supabase. Desde el avatar puedes cambiar el nombre de la demo. Con Supabase configurado, también puedes crear una cuenta, confirmar el correo, iniciar sesión y editar el nombre de tu cuenta. Las deudas y los grupos de la demo siguen siendo locales al navegador.

En **Authentication → URL Configuration** de Supabase, configura **Site URL** con el dominio HTTPS de PACTA. Añade `https://TU_DOMINIO/auth/callback` a **Redirect URLs**. Para desarrollo local, añade también `http://localhost:3000/auth/callback`. El enlace de confirmación debe abrirse en el mismo navegador donde empezaste el registro.
