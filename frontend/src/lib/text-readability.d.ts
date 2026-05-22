declare module "text-readability" {
  interface TextReadability {
    fleschKincaidGrade(text: string): number;
    fleschReadingEase(text: string): number;
    gunningFog(text: string): number;
    smogIndex(text: string): number;
    colemanLiauIndex(text: string): number;
    automatedReadabilityIndex(text: string): number;
    linsearWriteFormula(text: string): number;
    difficultWords(text: string): number;
    lexiconCount(text: string, removePunctuation?: boolean): number;
  }
  const textReadability: TextReadability;
  export default textReadability;
}
