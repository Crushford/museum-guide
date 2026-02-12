import type { Metadata } from 'next';
import { PageLayout } from '../../components/shared';
import { SectionCard } from '../../components/shared';

export const metadata: Metadata = {
  title: 'About Us',
};

export default function AboutPage() {
  return (
    <PageLayout title="About Museum Guide">
      <div className="space-y-6">
        <SectionCard title="Purpose of this app">
          <div className="space-y-4 text-primary leading-relaxed">
            <p>
              Museum Guide is a companion for museum visitors who want to go
              deeper than a plaque can go. Many museums have limited labels, no
              audio guide, or an audio guide that is outdated. This app helps
              you explore what you&apos;re seeing by letting you ask questions
              in the moment and listen to richer explanations while you walk.
            </p>
            <p>
              This is not trying to replace museums, curators, or official
              interpretation. Museums are the authority on their collections.
              Museum Guide sits alongside that work and makes it easier for
              visitors to explore, learn, and share curiosity with other
              visitors.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="How this app works">
          <div className="space-y-4 text-primary leading-relaxed">
            <p>
              Museum Guide is built on three layers of information. Each layer
              has a different purpose and a different level of authority.
            </p>
            <div className="space-y-2">
              <h3 className="font-semibold">
                1) Wikipedia and other canonical sources
              </h3>
              <p>
                When an artefact has a Wikipedia page, we use it as the
                foundation for that artefact&apos;s context in this app.
              </p>
              <p>
                Wikipedia is not perfect, but it is public, editable, and built
                around transparency, citations, and correction. When the
                Wikipedia article improves, this app can improve too. This layer
                is treated as the closest thing to a shared public reference
                point.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">
                2) Knowledge text (the artefact record)
              </h3>
              <p>
                Not every museum object has a Wikipedia page. When there is no
                suitable Wikipedia article, the app creates a knowledge text for
                the artefact.
              </p>
              <p>
                Knowledge text is meant to behave like a small, museum-scoped
                version of Wikipedia. It is a canonical description for the
                artefact inside this app. It can be corrected and improved over
                time when information is missing, unclear, or wrong. The goal is
                clarity and accuracy, not a perfect story.
              </p>
              <p>
                If we discover an error in what the app says about an artefact,
                the correct place to fix it is in the knowledge text or in the
                Wikipedia source it is based on. That way the correction becomes
                part of the foundation.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">
                3) AI-generated introductions and answers
              </h3>
              <p>
                On top of those sources, the app generates introductions and
                answers to questions using an AI model.
              </p>
              <p>
                These are designed for listening and exploration, like an
                unofficial tour guide. They are helpful and often very good, but
                they are not treated as the permanent truth record. We do not
                edit these outputs directly. If an answer contains a mistake, we
                correct the underlying source layer instead, then regenerate.
                That way improvements come from better foundations rather than
                patching individual conversations.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="How to interpret what you hear">
          <div className="space-y-4 text-primary leading-relaxed">
            <p>A simple rule of thumb is:</p>
            <p>
              Wikipedia and knowledge text are the editable foundation. AI
              answers are a generated guide based on that foundation.
            </p>
            <p>
              If something sounds wrong, the app is built so the correction
              happens at the root, and future explanations get better
              automatically.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="A shared archive of curiosity">
          <p className="text-primary leading-relaxed">
            Museum Guide is also designed to capture the questions visitors ask,
            because those questions are often the best part of a museum visit.
            One person&apos;s curiosity can help another person notice details,
            ask better questions, or understand an object in a new way. Over
            time, this creates a living public guide built from real visits and
            real questions.
          </p>
        </SectionCard>
      </div>
    </PageLayout>
  );
}
