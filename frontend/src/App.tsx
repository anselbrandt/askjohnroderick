import { Chat } from './chat/Chat'
import { Health } from './health/Health'
import { Speak } from './speak/Speak'

// Two pages do not justify a router. The path is read once: nothing links
// between them in-app, so a full load is the only way to arrive at either.
const page =
  window.location.pathname.replace(/\/+$/, '') === '/speak' ? 'speak' : 'chat'

function App() {
  return (
    <>
      <img className="backdrop" src="/john_roderick.jpg" alt="John Roderick" />
      {page === 'speak' ? <Speak /> : <Chat />}
      <Health />
    </>
  )
}

export default App
