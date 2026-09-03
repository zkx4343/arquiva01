'use client';

import { type SyntheticEvent, useState } from 'react';
import {
  Archive,
  Eye,
  EyeOff,
  FileAudio,
  FileImage,
  FileText,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AuthScreen({
  configured,
  onLogin,
}: {
  configured: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const login = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onLogin(email.trim(), password);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Não foi possível entrar.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden bg-[linear-gradient(145deg,oklch(0.28_0.07_164),oklch(0.16_0.035_184))] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-28 size-[430px] rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="absolute -bottom-36 left-20 size-[420px] rounded-full bg-sky-300/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/15">
            <Archive className="size-5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">Arquiva</p>
            <p className="text-xs text-white/60">Seu espaço organizado</p>
          </div>
        </div>
        <div className="relative my-auto max-w-xl py-16">
          <p className="text-sm font-semibold text-emerald-200">
            Documentos seguros e fáceis de encontrar
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.04] tracking-[-0.055em]">
            Tudo o que importa, organizado em um só lugar.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/68">
            Guarde imagens, PDFs, áudios, vídeos e documentos. Encontre por
            nome, visualize sem baixar e mantenha cada item na pasta certa.
          </p>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[
              { icon: FileImage, label: 'Imagens' },
              { icon: FileAudio, label: 'Áudios' },
              { icon: FileText, label: 'Documentos' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10"
              >
                <item.icon className="size-5 text-emerald-200" />
                <p className="mt-4 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/55">
          <ShieldCheck className="size-4" /> Acesso protegido pelo Supabase
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Archive className="size-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Arquiva</p>
              <p className="text-xs text-muted-foreground">
                Seu espaço organizado
              </p>
            </div>
          </div>
          <p className="text-sm font-semibold text-primary">Acesso privado</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">
            Entre no Arquiva
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use a conta cadastrada pelo administrador para acessar seus
            arquivos.
          </p>

          {configured ? (
            <form className="mt-8 space-y-5" onSubmit={login}>
              <label
                htmlFor="login-email"
                className="grid gap-2 text-sm font-medium"
              >
                E-mail
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 rounded-xl pl-10"
                    placeholder="voce@exemplo.com"
                    required
                  />
                </div>
              </label>
              <label
                htmlFor="login-password"
                className="grid gap-2 text-sm font-medium"
              >
                Senha
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 rounded-xl pl-10 pr-11"
                    placeholder="Sua senha"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={
                      showPassword ? 'Ocultar senha' : 'Mostrar senha'
                    }
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full rounded-xl"
                disabled={submitting}
              >
                {submitting ? 'Entrando…' : 'Entrar com segurança'}
              </Button>
            </form>
          ) : (
            <div className="mt-8 rounded-2xl border bg-muted/55 p-5">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="size-5" />
              </div>
              <p className="mt-4 font-semibold">Acesso sendo configurado</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                O administrador ainda precisa concluir a conexão segura com o
                Supabase.
              </p>
            </div>
          )}

          <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
            O Arquiva não mostra se um e-mail possui conta. Em caso de dúvida,
            fale com o administrador.
          </p>
        </div>
      </section>
    </main>
  );
}
