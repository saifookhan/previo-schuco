import { redirect } from 'next/navigation'

/**
 * Roles page is hidden for now — custom (dynamic) roles aren't needed yet. Role
 * descriptions are shown on the Access Rights matrix instead. `RolesManager`
 * and the roles API are kept so the page can come back.
 */
const RolesPage = () => {
  redirect('/app/settings/access-rights')
}

export default RolesPage
