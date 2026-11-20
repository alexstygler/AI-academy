export type TutorAnswer = { explanation: string; passage: 'vyklad' | 'priklad'; question?: string };
export async function askTutor(input: { endpoint: string; token: string; lessonId: string; question: string; demo: TutorAnswer }): Promise<TutorAnswer> {
  if (!input.endpoint) return input.demo;
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.token.trim() },
    body: JSON.stringify({ lessonId: input.lessonId, question: input.question }),
    signal: AbortSignal.timeout(14_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Tutor je nedostupný.');
  const answer = await response.json();
  if (!answer || typeof answer.explanation !== 'string' || answer.explanation.length > 1400 || !['vyklad','priklad'].includes(answer.passage) ||
      (answer.question !== undefined && (typeof answer.question !== 'string' || answer.question.length > 300))) throw new Error('Tutor vrátil neplatnou odpověď.');
  return answer;
}
