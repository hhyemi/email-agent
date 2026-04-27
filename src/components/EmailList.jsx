import EmailCard from './EmailCard'

export default function EmailList({ emails, results }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {emails.map((email) => (
        <EmailCard
          key={email.id}
          email={email}
          result={results.find((r) => r.id === email.id) ?? null}
        />
      ))}
    </div>
  )
}
