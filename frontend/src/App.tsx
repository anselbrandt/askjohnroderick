import { Chat } from './chat/Chat'
import { Compare } from './compare/Compare'
import { Health } from './health/Health'
import { Speak } from './speak/Speak'

// Three pages do not justify a router. The path is read once: nothing links
// between them in-app, so a full load is the only way to arrive at any.
const path = window.location.pathname.replace(/\/+$/, '')
const page = path === '/speak' ? 'speak' : path === '/compare' ? 'compare' : 'chat'

function App() {
  return (
    <>
      <img className="backdrop" src="/john_roderick.jpg" alt="John Roderick" />
      {page === 'speak' ? <Speak /> : page === 'compare' ? <Compare /> : <Chat />}
      <Health />
    </>
  )
}

export default App
