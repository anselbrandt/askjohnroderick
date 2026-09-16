import { Chat } from './chat/Chat'
import { Health } from './health/Health'

function App() {
  return (
    <>
      <img className="backdrop" src="/john_roderick.jpg" alt="John Roderick" />
      <Chat />
      <Health />
    </>
  )
}

export default App
