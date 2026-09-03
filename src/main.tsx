import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, RefreshCw } from 'lucide-react';

import AuthScreen from '@/app/auth-screen';
import '@/app/globals.css';
import {
  isSupabaseConfigured,
  supabase,
  type AuthUser,
} from '@/lib/supabase-client';

const ArquivaApp = lazy(() => import('@/app/arquiva-app'));

function userFromSession(
  user: { id: string; email?: string | null } | null | undefined,
): AuthUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email || 'conta@arquiva.local' };
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message))
    return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(message))
    return 'Confirme seu e-mail antes de entrar.';
  if (/rate limit|too many requests/i.test(message))
    return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  return 'Não foi possível entrar agora. Tente novamente.';
}

function Root() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setUser(userFromSession(data.session?.user));
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(userFromSession(session?.user));
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (!supabase) throw new Error('O Supabase ainda não foi configurado.');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  };

  const logout = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error('Não foi possível encerrar a sessão.');
  };

  if (loading)
    return (
      <main className="grid min-h-dvh place-items-center bg-background text-foreground">
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Archive className="size-6" />
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" /> Preparando o Arquiva…
          </p>
        </div>
      </main>
    );

  if (!user)
    return <AuthScreen configured={isSupabaseConfigured} onLogin={login} />;

  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-background text-foreground">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" /> Carregando seus
            arquivos…
          </p>
        </main>
      }
    >
      <ArquivaApp user={user} onLogout={logout} />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
