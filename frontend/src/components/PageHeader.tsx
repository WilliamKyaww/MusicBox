import type { ReactNode } from 'react'

/**
 * The Video experience's page header. It stays pinned under the top bar while
 * the page scrolls, with optional actions and a toolbar row (search, filters).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-header__row">
        <div className="page-header__titles">
          <h1 className="page-header__title">{title}</h1>
          {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
      {children ? <div className="page-header__toolbar">{children}</div> : null}
    </header>
  )
}
