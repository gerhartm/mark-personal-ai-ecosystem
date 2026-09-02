import { ComposerDesk } from '../components/ComposerDesk';
import { ViewHead } from '../components/Desk';

export function CreatorReference() {
  return (
    <section>
      <ViewHead title="Creator reference">
        Apply the stored creator's voice, phrasing, and argument patterns while keeping every factual claim grounded in Mark's selected crypto evidence.
      </ViewHead>
      <ComposerDesk
        mode="creator_reference"
        title="Write through the creator lens"
        description="This uses the real Creator Reference memory. It will report that the corpus is unavailable instead of inventing a voice when no usable reference material exists."
        focusLabel="What should the creator explain or argue?"
        placeholder="Describe the idea, audience, and point of view for the output."
        templateOptions={[{ value: 'x_post', label: 'X post' }, { value: 'twitter_thread', label: 'X thread' }, { value: 'linkedin_post', label: 'LinkedIn post' }, { value: 'speaking_prep', label: 'Presentation prep' }]}
      />
    </section>
  );
}
