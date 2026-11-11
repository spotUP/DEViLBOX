/**
 * SettingsSection - a Settings dialog section that hides itself while the search
 * query excludes it. The set of visible ids is computed once in SettingsModal
 * (filterSettingsEntries) and shared through this context.
 */
import React, { createContext, useContext } from 'react';

/** null = no active query, every section is visible. */
export const SettingsVisibleSectionsContext = createContext<ReadonlySet<string> | null>(null);

export interface SettingsSectionProps {
  /** Id from SETTINGS_SEARCH_INDEX. */
  id: string;
  children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ id, children }) => {
  const visible = useContext(SettingsVisibleSectionsContext);
  if (visible && !visible.has(id)) return null;
  return <section>{children}</section>;
};
