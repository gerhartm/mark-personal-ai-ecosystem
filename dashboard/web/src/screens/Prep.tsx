import { ComposerDesk } from '../components/ComposerDesk';
import { ViewHead } from '../components/Desk';

export function Prep() {
  return (
    <section>
      <ViewHead title="Prep">
        Build a speaking brief from Mark's material with a thesis, supporting points, counterarguments, likely questions, and source citations.
      </ViewHead>
      <ComposerDesk
        mode="mark"
        title="Prepare to speak"
        description="Start with the question, event, panel, or argument Mark needs to address. Select exact sources when the brief must stay tightly scoped."
        focusLabel="Question or topic"
        placeholder="What should Mark be ready to explain, defend, or challenge?"
        templateOptions={[{ value: 'speaking_prep', label: 'Speaking brief' }, { value: 'month_in_review', label: 'Month review' }, { value: 'year_in_review', label: 'Year review' }]}
      />
    </section>
  );
}
