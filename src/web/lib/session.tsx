import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, setCsrf } from './api';

export interface AuthState {
  setup_required: boolean;
  oidc: { enabled: boolean; name?: string };
  smtp: boolean;
  version: string;
  session: null | {
    user: { id: string; name: string; email: string; totp_enabled: boolean; is_instance_admin: boolean; has_password: boolean };
    org_id: string | null;
    orgs: { id: string; name: string; role: string }[];
    csrf: string;
    mfa_pending: boolean;
  };
}

export interface Me {
  principal: { kind: 'user'; id: string; name: string; email: string; role: string; instance_admin: boolean };
  org: { id: string; name: string; slug: string; branding: any; settings: any; custom_domain: string | null };
  permissions: string[];
  features: { smtp: boolean; office_conversion: boolean; sms: boolean; qes: null | { name: string; verified: boolean }; timestamp_authority: string | null; oidc: boolean };
}

const Ctx = createContext<{ auth: AuthState; me: Me | null; refresh: () => Promise<void> } | null>(null);

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const qc = useQueryClient();
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const a = await get<AuthState>('/api/auth/state');
      setCsrf(a.session?.csrf ?? '');
      return a;
    },
    staleTime: 60_000,
  });
  const loggedIn = !!auth.data?.session && !auth.data.session.mfa_pending && !!auth.data.session.org_id;
  const me = useQuery({ queryKey: ['me', auth.data?.session?.org_id], queryFn: () => get<Me>('/api/v1/me'), enabled: loggedIn, staleTime: 60_000 });
  if (auth.isLoading || (loggedIn && me.isLoading)) return <>{fallback}</>;
  if (!auth.data) return <>{fallback}</>;
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['auth'] });
    await qc.invalidateQueries({ queryKey: ['me'] });
  };
  return <Ctx.Provider value={{ auth: auth.data, me: me.data ?? null, refresh }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider fehlt');
  return c;
}

export function useCan(perm: string) {
  const { me } = useSession();
  return !!me?.permissions.includes(perm);
}
