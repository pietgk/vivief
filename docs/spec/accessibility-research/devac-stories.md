we want to have reference storybooks for devac that can be used
to test scan-storybook so that it can 
- detect close to 90% of all WCAG accessibility issues 
- supply correct verified knowledge to llm's on how to solve accessibility issues including examples

we think we need several reference storybooks each for a specific goal
- storybook-axe-core based on axe-core rules. See Option A in a11y-reference-storybook-specs.md. this can be used to verify and improve scan-storybook close to the html web context.
- storybook-zag based on all zag.js components to be able to test the concepts and ideas from use-state-machine.md to enable a more extensive way using xstate model based testing applied to accessibility testing to make it possible to test most wcag issues. If possible each story should have the correct component with no accessibility issue, the version with 1 accessibility issue using the knowledge and concepts from storybook-axe-core in a way the all possible issues are distributed of the components in a way they all are covered in a logical appropriate way that we can use them to test scan-storybook detection and give more examples to the llms on how to fix the issues.
- storybook-universal same as storybook-zag but supporting react-native. see the research in 
app-to-web-for-accessibility.md where we looked into the work needed to support zag.js components in react-native context needing extensive work to generalize the dom concept

the above 3 storybooks stories should include appropriate documentation on the component and its accessibility context

after implementing devac scan-storybook we plannen is simple testing context in test-scan-storybook-initial-plan-ideas.md, this could be usefull but note that it did not know about the extensive testing with reference storybooks and the scope of trying to achieve 90% accessibility issue detection.

a final part of this plan will be to use it to fix all issues in all the stories in the ~/ws/app.
