import {
  Children,
  createContext,
  isValidElement,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface RouterValue {
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error('Router components must be rendered inside BrowserRouter.');
  }
  return value;
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const value = useMemo<RouterValue>(
    () => ({
      pathname,
      navigate: (to, options) => {
        const target = new URL(to, window.location.origin);
        if (options?.replace) {
          window.history.replaceState(null, '', `${target.pathname}${target.search}${target.hash}`);
        } else {
          window.history.pushState(null, '', `${target.pathname}${target.search}${target.hash}`);
        }
        setPathname(target.pathname);
        window.scrollTo({ top: 0 });
      },
    }),
    [pathname],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
}

export function Link({ to, onClick, children, ...props }: LinkProps) {
  const { navigate } = useRouter();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

export function NavLink({ className, ...props }: LinkProps) {
  const { pathname } = useRouter();
  const classes = [className, pathname === props.to ? 'active' : ''].filter(Boolean).join(' ');
  return <Link className={classes || undefined} {...props} />;
}

interface RouteProps {
  path: string;
  element: ReactNode;
}

export function Route(_props: RouteProps) {
  return null;
}

export function Routes({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  const routes = Children.toArray(children);
  const match = routes.find(
    (child): child is ReactElement<RouteProps> =>
      isValidElement<RouteProps>(child) && child.props.path === pathname,
  );
  const fallback = routes.find(
    (child): child is ReactElement<RouteProps> =>
      isValidElement<RouteProps>(child) && child.props.path === '*',
  );
  return match?.props.element ?? fallback?.props.element ?? null;
}

export function useNavigate() {
  return useRouter().navigate;
}
