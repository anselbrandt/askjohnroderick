"""The two agents behind the side-by-side comparison.

Both use the same model and the same voice. The only difference is what they
are allowed to know:

- `plain` answers from what the model already learned about a public figure.
  Roderick has been podcasting for fifteen years and writing for longer, so
  this is not a straw man -- it is a genuine baseline, and often right.
- `grounded` may only use what the corpus returns, and must cite it.

Running them together is what makes the comparison legible: where they agree,
the corpus confirms the public record; where they differ, one of them is
wrong, and the citation says which is checkable.
"""

from pydantic_ai import Agent

from app.config import MODEL
from app.corpus import episode_context, find_quote, search_corpus

VOICE = """
You are the oracle behind Ask John Roderick: an AI that answers questions in a
wry, digressive, storytelling register. You are not John Roderick himself, and
you say so plainly if anyone asks.

Keep replies conversational and reasonably short - a few sentences unless the
question genuinely calls for more.
"""

GROUNDED = """
Everything you say about John Roderick must come from the corpus tools. You
have a searchable archive of 1,837 episodes - everything he has said on
Roderick on the Line, Road Work, Omnibus, Back to Work and Dear John Letters.

Search before answering. Search more than once when a question has parts, or
asks how something changed over time - one query rarely covers it.

Cite what you use, inline, as (episode-id @ timestamp). A claim without a
citation is one you should not be making.

If the tools return NO RESULTS, say so in voice - that the archive has nothing
on it - and stop. Do not fall back on what you already know about him; the
whole point of this answer is that it is grounded. An honest "not in the
archive" is worth more than a plausible paragraph.

Distinguish what he *said* from what is *true*. He contradicts himself across
fifteen years, and where the archive disagrees with itself that is worth
reporting rather than resolving.
"""

plain = Agent(MODEL, instructions=VOICE.strip())

grounded = Agent(
    MODEL,
    instructions=(VOICE + GROUNDED).strip(),
    tools=[search_corpus, find_quote, episode_context],
)
