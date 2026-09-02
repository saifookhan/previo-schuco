import { redirect } from 'next/navigation'

/**
 * Redirect /admin to the admin dashboard.
 */
const AdminIndexPage = () => {
  redirect('/admin/dashboard')
}

export default AdminIndexPage
