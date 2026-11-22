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

La integración prepara los clientes de navegador y servidor. La sesión de la interfaz se renueva en el navegador y el proxy queda reservado para las rutas de API. Si falta alguna de las dos variables, el proxy deja pasar las solicitudes y los clientes devuelven `null`. La demo sigue usando el almacenamiento local con o sin Supabase. Desde el avatar puedes cambiar el nombre de la demo. Con Supabase configurado, también puedes crear una cuenta, confirmar el correo, iniciar sesión y editar el nombre de tu cuenta. La demo sin cuenta y sus grupos siguen guardándose en el navegador.

En **Authentication → URL Configuration** de Supabase, configura **Site URL** con el dominio HTTPS de PACTA. Añade `https://TU_DOMINIO/auth/callback` a **Redirect URLs**. Para desarrollo local, añade también `http://localhost:3000/auth/callback`. El enlace de confirmación debe abrirse en el mismo navegador donde empezaste el registro.

Si el correo no llega, revisa spam y usa **Iniciar sesión → Reenviar confirmación**. El servicio de correo predeterminado de Supabase está limitado a las direcciones del equipo. Para que otras personas reciban las confirmaciones, configura un proveedor SMTP propio en Supabase. [Configurar SMTP en Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

## Activar las deudas compartidas

1. Configura Supabase y Vercel como se indica arriba.
2. En Supabase, abre **SQL Editor → New query**. Copia el contenido completo de [202611220001_shared_debts.sql](supabase/migrations/202611220001_shared_debts.sql), pégalo y pulsa **Run** una sola vez.
3. En PACTA, inicia sesión y registra una deuda. Abre **Compartir invitación** y envía el enlace desde tu móvil. La otra persona inicia sesión con su propia cuenta y pulsa **Aceptar invitación**. El enlace caduca a los siete días y vincula una sola cuenta invitada.

Los dos participantes ven la deuda en **Actividad**. Quien recibe una propuesta puede aceptarla o rechazarla. La persona a la que deben dinero confirma que se cumplió el acuerdo. Las deudas compartidas aparecen en ambos saldos hasta que se saldan.

PACTA empieza con el saldo a cero para quienes aún no registraron deudas. Los movimientos de ejemplo de versiones anteriores se retiran automáticamente y se conservan los movimientos que creaste manualmente sin iniciar sesión. Estos últimos siguen siendo locales y aparecen al usar la app sin una cuenta. Los grupos de ejemplo también siguen siendo locales.

## Borrar una deuda

Abre la deuda en **Actividad**, pulsa **Borrar deuda** y confirma. Se pueden borrar las deudas locales y las invitaciones aún sin aceptar. Cuando un amigo ya aceptó, la deuda queda visible para ambas cuentas.

En Supabase, ejecuta [202611220002_delete_unclaimed_debts.sql](supabase/migrations/202611220002_delete_unclaimed_debts.sql) después de la migración inicial para habilitar el borrado de invitaciones pendientes.

## Añadir amigos y crear grupos

En Supabase, ejecuta [202611220003_friends_and_groups.sql](supabase/migrations/202611220003_friends_and_groups.sql) una vez después de la migración inicial de deudas.

En PACTA, inicia sesión y abre **Grupos**. Escribe el nombre de usuario exacto de la otra persona, con o sin `@`, envía una solicitud y pídele que pulse **Aceptar** en su sección **Amigos**. A partir de entonces puedes seleccionar a esa persona al registrar una deuda. La verá en **Actividad** desde su cuenta.

En **Grupos**, crea un grupo, ábrelo y selecciona a un amigo para invitarlo. La otra persona acepta desde esa misma sección. Para añadir una deuda al grupo, ábrelo y pulsa **Nueva deuda** o **Añadir**. Una deuda sigue siendo privada entre las dos personas implicadas, incluso dentro de un grupo.

## Chat entre amigos

Ejecuta [202611220004_friend_chat.sql](supabase/migrations/202611220004_friend_chat.sql) en Supabase después de activar Amigos y Grupos. En **Grupos → Mis amigos**, pulsa **Chat** al lado de una amistad aceptada. La conversación es privada y muestra los 50 mensajes más recientes. El chat se actualiza mientras está abierto.

## Bandeja de mensajes y notificaciones

Ejecuta [202611220005_inbox_and_notifications.sql](supabase/migrations/202611220005_inbox_and_notifications.sql) en Supabase después de activar el chat. El icono del avión de papel en la esquina superior derecha abre tus conversaciones recientes. La campana avisa de los mensajes sin leer, las deudas nuevas y los cambios en propuestas o pagos. Pulsa un aviso para abrir la conversación o la deuda. Los avisos aparecen dentro de PACTA mientras tienes la app abierta.

## Nombres de usuario y registro sin confirmación

Ejecuta [202611220006_usernames.sql](supabase/migrations/202611220006_usernames.sql) en Supabase después de la migración de Amigos y Grupos. Las cuentas existentes eligen su nombre de usuario en **Mi perfil → Guardar perfil**. Las cuentas nuevas lo eligen al registrarse. Los nombres son únicos y las solicitudes de amistad usan el nombre de usuario exacto. El correo se sigue usando para iniciar sesión.

En Supabase, abre **Authentication → Sign In / Providers → Email**, desactiva **Confirm email** y guarda. Las cuentas nuevas podrán iniciar sesión al registrarse. Si una cuenta creada antes sigue pendiente, comprueba su estado en **Authentication → Users**. Este ajuste permite registrar una cuenta sin demostrar acceso al buzón, por eso la búsqueda de amigos usa el nombre de usuario.

## Repartir una deuda entre todo un grupo

Ejecuta [202611220007_group_debt_split.sql](supabase/migrations/202611220007_group_debt_split.sql) en Supabase después de activar Amigos y Grupos. En **Nueva deuda**, selecciona **Registrar para → Todo un grupo**, elige el grupo e introduce el importe total. PACTA muestra cuánto corresponde a cada miembro que ya aceptó formar parte del grupo. Si el importe incluye tu parte, deja marcada **Incluir mi parte en el reparto**. Cada uno de los demás miembros recibe su deuda en su cuenta. El contador de **Grupos** muestra las solicitudes de amistad y las invitaciones de grupo pendientes.

## Saldo por persona en un grupo

Ejecuta [202611220008_group_balances.sql](supabase/migrations/202611220008_group_balances.sql) en Supabase después de activar Amigos y Grupos. En **Grupos → Abrir**, la tabla **Saldo por persona** muestra lo que debe y lo que le deben a cada miembro dentro de ese grupo. Solo los miembros aceptados pueden consultar el resumen. La tabla cuenta las deudas pendientes entre miembros y excluye las saldadas. Cada movimiento individual sigue siendo visible únicamente para las dos cuentas implicadas.

Para asignar importes distintos, ejecuta [202611220009_custom_group_split.sql](supabase/migrations/202611220009_custom_group_split.sql) después de la migración de reparto. En **Nueva deuda → Todo un grupo**, elige **Me deben** o **Yo debo**, selecciona **Importe por persona** y escribe lo que corresponde a cada miembro. Un importe de 0 € deja a esa persona fuera del reparto.

## Deudas compartidas en tiempo real

Ejecuta [202611220010_realtime_debts.sql](supabase/migrations/202611220010_realtime_debts.sql) en Supabase una vez para activar Realtime en la tabla de deudas. Cuando la app está abierta, las deudas nuevas y los cambios en propuestas o pagos actualizan Actividad, la ficha y la campana. Si se corta la conexión en tiempo real, PACTA sigue consultando los cambios automáticamente.

### Audios y emojis

Ejecuta [202611220011_chat_voice_notes.sql](supabase/migrations/202611220011_chat_voice_notes.sql) después de la migración de chat para activar las notas de voz. En un chat, pulsa el micrófono, graba hasta un minuto y escucha la vista previa antes de enviar. Solo los participantes pueden descargar la grabación del almacenamiento privado. La cara sonriente abre el selector de emojis del mensaje.

### Chat de grupo

Tras activar los audios, ejecuta [202611220012_group_chat.sql](supabase/migrations/202611220012_group_chat.sql). Abre **Grupos → Chat del grupo**, o elige el grupo en el menú del avión de papel para enviar texto, emojis y notas de voz. Solo los miembros aceptados pueden acceder al chat y a sus audios.
