import { createStandardsModel, type StandardsAssociation, type StandardsClass, type StandardsDatatype, type StandardsPackage, type StandardsModel } from "@/lib/standards/model";

function getNodeId(node: Element) {
  return node.getAttribute("xmi:id") || node.getAttribute("id") || "";
}

function getNodeName(node: Element) {
  return node.getAttribute("name") || "";
}

function findOwningPackage(node: Element) {
  let current = node.parentElement;

  while (current) {
    if (current.matches("packagedElement[xmi\\:type='uml:Package'], packagedElement[xmi:type='uml:Package']")) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

export function mapXmiToStandardsModel(xml: Document): StandardsModel {
  const packages: Array<StandardsPackage | null> = Array.from(
    xml.querySelectorAll("packagedElement[xmi\\:type='uml:Package'], packagedElement[xmi:type='uml:Package']"),
  )
    .map((packageNode) => {
      const id = getNodeId(packageNode);

      if (!id) {
        return null;
      }

      return {
        id,
        label: getNodeName(packageNode) || id,
        definition: packageNode.querySelector("ownedComment")?.getAttribute("body") || undefined,
        trace: {
          sourceIds: [id],
          sourceFormat: "xmi",
        },
      } satisfies StandardsPackage;
    });

  const datatypeIds = new Set<string>();
  const classes: Array<StandardsClass | null> = Array.from(
    xml.querySelectorAll("packagedElement[xmi\\:type='uml:Class'], packagedElement[xmi:type='uml:Class']"),
  )
    .map((classNode) => {
      const id = getNodeId(classNode);

      if (!id) {
        return null;
      }

      const packageNode = findOwningPackage(classNode);
      const packageId = packageNode ? getNodeId(packageNode) : undefined;
      const attributes = Array.from(classNode.querySelectorAll("ownedAttribute")).map((attributeNode, index) => {
        const datatypeId = attributeNode.getAttribute("type") || undefined;

        if (datatypeId) {
          datatypeIds.add(datatypeId);
        }

        return {
          id: getNodeId(attributeNode) || `${id}-attribute-${index + 1}`,
          name: attributeNode.getAttribute("name") || `attribute-${index + 1}`,
          datatypeId,
          cardinality: undefined,
          definition: attributeNode.querySelector("ownedComment")?.getAttribute("body") || undefined,
        };
      });
      const superClassIds = Array.from(classNode.querySelectorAll("generalization"))
        .map((generalizationNode) => generalizationNode.getAttribute("general") || "")
        .filter(Boolean);

      return {
        id,
        label: getNodeName(classNode) || id,
        packageId,
        definition: classNode.querySelector("ownedComment")?.getAttribute("body") || undefined,
        attributes,
        identifiers: [],
        superClassIds,
        trace: {
          sourceIds: [id],
          sourceFormat: "xmi",
        },
      } satisfies StandardsClass;
    });

  const datatypes: StandardsDatatype[] = Array.from(datatypeIds).map((datatypeId) => ({
    id: datatypeId,
    label: datatypeId,
    trace: {
      sourceIds: [datatypeId],
      sourceFormat: "xmi",
    },
  }));

  const associations: Array<StandardsAssociation | null> = Array.from(
    xml.querySelectorAll("packagedElement[xmi\\:type='uml:Association'], packagedElement[xmi:type='uml:Association']"),
  )
    .map((associationNode) => {
      const id = getNodeId(associationNode);

      if (!id) {
        return null;
      }

      const members = (associationNode.getAttribute("memberEnd") || "").split(/\s+/).filter(Boolean);

      if (members.length < 2) {
        return null;
      }

      const packageNode = findOwningPackage(associationNode);
      const packageId = packageNode ? getNodeId(packageNode) : undefined;

      return {
        id,
        label: getNodeName(associationNode) || "association",
        packageId,
        definition: associationNode.querySelector("ownedComment")?.getAttribute("body") || undefined,
        source: {
          classId: members[0],
        },
        target: {
          classId: members[1],
        },
        trace: {
          sourceIds: [id],
          sourceFormat: "xmi",
        },
      } satisfies StandardsAssociation;
    });

  return createStandardsModel({
    profiles: ["mim"],
    packages: packages.filter((item): item is StandardsPackage => item !== null),
    datatypes,
    classes: classes.filter((item): item is StandardsClass => item !== null),
    associations: associations.filter((item): item is StandardsAssociation => item !== null),
    metadata: {
      sourceFormat: "xmi",
    },
  });
}
