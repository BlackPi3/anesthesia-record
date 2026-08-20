/**
 * What the two entry sheets call the parts of their drawer.
 *
 * AntD renders a drawer as a stack of nested elements, and the stylesheet needs to reach most of
 * them: the mask, the panel that positions the card, the card itself, and the header and footer
 * that must stay put while the body scrolls. The root is named too, since qualifying a rule by it
 * is what lets this file's styling win over AntD's own. Passing a single `className` only names one of those, which left
 * the stylesheet guessing at AntD's internal element names — and when AntD 6 renamed
 * `ant-drawer-content` to `ant-drawer-section`, the rule capping the sheet's height stopped
 * matching anything and the sheet grew off the top of the window. Names handed out by the
 * component cannot silently stop matching.
 *
 * Shared by `AddEntry` and `EditEntry` because it is the one thing about the drawer that has to
 * be identical in both: the same card, in the same place, at the same size. Everything else about
 * the two sheets differs, which is why they are still two components.
 */
export const SHEET_PARTS = {
  root: 'entry-sheet',
  mask: 'entry-sheet__mask',
  wrapper: 'entry-sheet__panel',
  section: 'entry-sheet__card',
  header: 'entry-sheet__head',
  body: 'entry-sheet__body',
  footer: 'entry-sheet__foot',
} as const
