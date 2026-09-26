import { neobrutalism } from "@clerk/ui/themes";

/**
 * Clerk components dressed in the "Arcade" art direction: neobrutalism (thick outlines,
 * solid drop shadows) recoloured with the game palette and fonts.
 */
export const arcadeAppearance = {
  theme: neobrutalism,
  variables: {
    colorPrimary: "#ffc933",
    colorPrimaryForeground: "#1c1840",
    colorForeground: "#1c1840",
    colorMutedForeground: "#5e5a86",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#1c1840",
    colorNeutral: "#1c1840",
    colorDanger: "#d93a42",
    colorSuccess: "#1f9d60",
    colorRing: "#ffc933",
    borderRadius: "14px",
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
    fontWeight: { normal: 600, medium: 700, semibold: 800, bold: 900 },
    fontSize: "15px",
  },
  elements: {
    cardBox: "!rounded-[22px] !border-[3px] !border-[#1c1840] !shadow-[0_6px_0_#1c1840]",
    card: "!shadow-none !border-0",
    headerTitle: "!font-[family-name:var(--font-lilita)] !font-normal !text-3xl",
    headerSubtitle: "!font-bold",
    formButtonPrimary:
      "!font-[family-name:var(--font-lilita)] !font-normal !text-xl !normal-case !border-[3px] !border-[#1c1840] !shadow-[0_4px_0_#1c1840] !py-3",
    socialButtonsBlockButton: "!border-[3px] !border-[#1c1840] !shadow-[0_3px_0_#1c1840] !font-extrabold",
    formFieldInput: "!border-[3px] !border-[#1c1840] !shadow-none",
    footer: "!bg-[#efeefa]",
    footerActionLink: "!text-[#2536b8] !font-extrabold",
  },
} as const;
