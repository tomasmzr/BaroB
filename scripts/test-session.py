"""Crea (si hace falta) un usuario de prueba en Supabase y devuelve su sesión (JSON).
Uso: SERVICE=<service_role key> ANON=<anon key> python3 -I scripts/test-session.py <project-ref> <email>
Usar siempre emails @barob.test y borrarlos al terminar (ver CLAUDE.md, "Probar la app")."""
import json, os, sys, urllib.request

ref, email = sys.argv[1], sys.argv[2]
base = f"https://{ref}.supabase.co/auth/v1"
svc, anon = os.environ["SERVICE"], os.environ["ANON"]


def call(path, body, key):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


try:
    call("/admin/users", {"email": email, "email_confirm": True}, svc)
except urllib.error.HTTPError:
    pass  # ya existe
link = call("/admin/generate_link", {"type": "magiclink", "email": email}, svc)
otp = link.get("email_otp") or link.get("properties", {}).get("email_otp")
s = call("/verify", {"type": "magiclink", "email": email, "token": otp}, anon)
print(json.dumps(s))
