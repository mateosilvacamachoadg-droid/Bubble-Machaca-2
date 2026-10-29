# Bubble

La asistente del equipo **Machaca**: platica, ayuda con gráficas, recorridos del robot, manglares y estuarios, el proyecto Pastilla, el libro del equipo, fotos y música.

Funciona en Android, iPhone, iPad, Windows, Mac y Linux (se instala desde el navegador como app).

## Cómo está organizado

| Carpeta / archivo | Qué es |
|---|---|
| `public/` | La app (lo que se ve en la página). |
| `netlify/functions/` | El servidor: cuentas, conversación con Gemini, fotos y libro compartidos. |
| `netlify.toml` | Le dice a Netlify qué publicar. |
| `package.json` | Lo que necesita el servidor. |
| `index.html` | Solo lleva a `public/` (para GitHub Pages). |

## Publicarla con Netlify (recomendado)

1. En Netlify, conecta este repositorio al sitio.
2. No hace falta comando de compilación: `netlify.toml` ya dice todo.
3. En **Variables de entorno** del sitio deben existir:
   - `GEMINI_API_KEY`: la clave de Gemini.
   - `USUARIOS`: las cuentas, así: `Nombre:contraseña, Nombre:contraseña, …`
   - Opcionales: `EQUIPO` (por defecto Machaca), `GEMINI_MODEL`.

Cada cambio que se sube a este repositorio actualiza la página sola.

## Importante

Las contraseñas y la clave de Gemini **nunca** van en este repositorio. Solo viven en las variables de entorno de Netlify.
