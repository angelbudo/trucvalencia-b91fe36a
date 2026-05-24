// Compatibility shim mapping the legacy router API used in pages onto react-router-dom.
// All app code imports from "@/lib/router-shim" so swapping the underlying router
// (originally TanStack Router) only requires editing this file.
import * as React from "react";
import {
  Link as RRLink,
  NavLink as RRNavLink,
  useNavigate as rrUseNavigate,
  useLocation as rrUseLocation,
  useParams as rrUseParams,
  useSearchParams as rrUseSearchParams,
} from "react-router-dom";

type LinkProps = {
  to: string;
  replace?: boolean;
  state?: unknown;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  [key: string]: any;
};

export const Link: React.FC<LinkProps> = ({ to, replace, state, ...rest }) => {
  return <RRLink to={to} replace={replace} state={state as any} {...rest} />;
};

export interface NavLinkProps {
  to: string;
  replace?: boolean;
  end?: boolean;
  className?: string | ((args: { isActive: boolean; isPending: boolean }) => string | undefined);
  style?: React.CSSProperties | ((args: { isActive: boolean; isPending: boolean }) => React.CSSProperties | undefined);
  children?: React.ReactNode | ((args: { isActive: boolean; isPending: boolean }) => React.ReactNode);
  [key: string]: any;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, replace, end, className, style, children, ...rest }, ref) => {
    return (
      <RRNavLink
        ref={ref as any}
        to={to}
        replace={replace}
        end={end}
        className={typeof className === "function"
          ? ({ isActive, isPending }) => className({ isActive, isPending }) || ""
          : className}
        style={typeof style === "function"
          ? ({ isActive, isPending }) => style({ isActive, isPending })
          : style}
        {...rest}
      >
        {typeof children === "function"
          ? ({ isActive, isPending }: any) => children({ isActive, isPending })
          : (children as any)}
      </RRNavLink>
    );
  }
);
NavLink.displayName = "NavLinkShim";

export function useNavigate() {
  const nav = rrUseNavigate();
  return (to: string | number, opts?: { replace?: boolean; state?: unknown }) => {
    if (typeof to === "number") {
      nav(to);
      return;
    }
    nav(to, { replace: opts?.replace, state: opts?.state as any });
  };
}

export function useLocation() {
  return rrUseLocation();
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return rrUseParams() as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void] {
  const [params, setParams] = rrUseSearchParams();
  const set = (next: URLSearchParams | Record<string, string>) => {
    if (next instanceof URLSearchParams) setParams(next);
    else setParams(next);
  };
  return [params, set];
}