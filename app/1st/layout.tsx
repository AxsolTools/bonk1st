// This layout is kept for backward compatibility with /1st/* routes
// The main BONK1ST experience is now at the root /
export default function FirstLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

