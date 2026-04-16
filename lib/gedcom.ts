
export interface GedcomNode {
  tag: string;
  data: string;
  children: GedcomNode[];
}

export interface Individual {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  gender?: string;
  familiesAsChild: string[];
  familiesAsSpouse: string[];
}

export interface Family {
  id: string;
  husbandId?: string;
  wifeId?: string;
  childrenIds: string[];
}

export interface GedcomData {
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
}

export function parseGedcom(text: string): GedcomData {
  const lines = text.split(/\r?\n/);
  const root: GedcomNode[] = [];
  const stack: { level: number; node: GedcomNode }[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Standard GEDCOM: LEVEL TAG_OR_POINTER [DATA]
    // Example: 0 @I1@ INDI or 1 NAME John Doe
    const match = trimmed.match(/^(\d+)\s+(@\S+@|\S+)(?:\s+(.*))?$/);
    if (!match) return;

    const level = parseInt(match[1]);
    const tagOrPointer = match[2];
    const data = match[3] || '';

    const newNode: GedcomNode = {
      tag: tagOrPointer,
      data: data,
      children: [],
    };

    if (level === 0) {
      root.push(newNode);
      stack.length = 0;
      stack.push({ level, node: newNode });
    } else {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length > 0) {
        stack[stack.length - 1].node.children.push(newNode);
        stack.push({ level, node: newNode });
      }
    }
  });

  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};

  root.forEach((node) => {
    if (node.data === 'INDI') {
      const id = node.tag;
      const ind: Individual = {
        id,
        name: 'Unknown',
        familiesAsChild: [],
        familiesAsSpouse: [],
      };

      node.children.forEach((child) => {
        if (child.tag === 'NAME') {
          ind.name = child.data.replace(/\//g, '').trim();
          const nameParts = child.data.split('/');
          if (nameParts.length >= 3) {
             ind.firstName = nameParts[0].trim();
             ind.lastName = nameParts[1].trim();
          }
        } else if (child.tag === 'SEX') {
          ind.gender = child.data;
        } else if (child.tag === 'BIRT') {
          const dateNode = child.children.find((c) => c.tag === 'DATE');
          if (dateNode) ind.birthDate = dateNode.data;
        } else if (child.tag === 'DEAT') {
          const dateNode = child.children.find((c) => c.tag === 'DATE');
          if (dateNode) ind.deathDate = dateNode.data;
        } else if (child.tag === 'FAMC') {
          ind.familiesAsChild.push(child.data);
        } else if (child.tag === 'FAMS') {
          ind.familiesAsSpouse.push(child.data);
        }
      });
      individuals[id] = ind;
    } else if (node.data === 'FAM') {
      const id = node.tag;
      const fam: Family = {
        id,
        childrenIds: [],
      };

      node.children.forEach((child) => {
        if (child.tag === 'HUSB') fam.husbandId = child.data;
        else if (child.tag === 'WIFE') fam.wifeId = child.data;
        else if (child.tag === 'CHIL') fam.childrenIds.push(child.data);
      });
      families[id] = fam;
    }
  });

  return { individuals, families };
}
