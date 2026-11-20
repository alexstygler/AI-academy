export function grade(questions, answers) {
  const results = questions.map(({ id, answer, options }) => {
    const chosen = answers[id];
    if (!Number.isInteger(chosen) || !options[chosen]) throw new Error('Vyber odpověď u každé otázky.');
    return { id, correct: answer === chosen, feedback: options[chosen].feedback };
  });
  return { results, score: results.filter(({ correct }) => correct).length, total: results.length };
}
