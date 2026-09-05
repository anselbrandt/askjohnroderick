def test_footnotes_are_not_spoken():
    """Citations are for the eye.

    Read aloud, "the paradise that it is, frankly, three" is worse than no
    citation at all, and the block of episode ids at the end is worse still.
    """
    from app.speech import speakable

    reply = (
        "They built a new city over the top of it¹, and I love it anyway².\n"
        "\n"
        "¹ rotl-634 @ 45:10\n"
        "² dearjohnletters-164430983 @ 8:37"
    )
    spoken = speakable(reply)
    assert spoken == "They built a new city over the top of it, and I love it anyway."
    assert "rotl" not in spoken
    assert not any(c in spoken for c in "⁰¹²³")


def test_inline_citations_still_stripped():
    """Replies written before the footnote change must not read as coordinates."""
    from app.speech import speakable

    assert speakable("A giant mall (rotl-044 @ 23:21). Yes.") == "A giant mall. Yes."
