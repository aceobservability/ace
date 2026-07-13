import { Navigate, useParams } from 'react-router-dom'

/** Substitute `:param` tokens from the current route into a target path. */
export function resolveParamPath(template: string, params: Record<string, string | undefined>) {
  return template.replace(/:([A-Za-z]+)/g, (_, key: string) => params[key] ?? '')
}

export function createParamRedirect(template: string) {
  return function ParamRedirect() {
    const params = useParams()
    return <Navigate to={resolveParamPath(template, params)} replace />
  }
}