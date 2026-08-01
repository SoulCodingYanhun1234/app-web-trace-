import { defineComponent, h } from 'vue';
import { ElSelect } from 'element-plus';

/**
 * Global select wrapper.
 *
 * Keeps every Element Plus select attached to <body>, aligned to the trigger
 * width, and able to flip above the trigger when the available viewport space
 * below is limited (for example inside dialogs and drawers).
 */
export default defineComponent({
  name: 'AppSelect',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h(ElSelect as any, {
      teleported: true,
      appendTo: 'body',
      fitInputWidth: true,
      placement: 'bottom-start',
      fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
      offset: 8,
      ...attrs,
    } as any, slots);
  },
});
