import { redirect } from 'next/navigation';

export default function Page() {
  // Keep the route available and redirect to the homepage online devices section.
  redirect('/');
}
