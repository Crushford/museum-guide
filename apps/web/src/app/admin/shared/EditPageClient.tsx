'use client';

import { EntityDetailsForm } from './EntityDetailsForm';
import { ParentSelector } from './ParentSelector';
import { ChildEntityList } from './ChildEntityList';

type Museum = {
  id: number;
  name: string;
};

type Room = {
  id: number;
  name: string;
  parentId: number | null;
};

type BaseEntity = {
  id: number;
  name: string;
  knowledgeText: string | null;
  furtherReading: string[];
};

type MuseumEntity = BaseEntity & {
  type: 'museum';
};

type RoomEntity = BaseEntity & {
  type: 'room';
  parentId: number | null;
};

type ArtifactEntity = BaseEntity & {
  type: 'artifact';
  parentId: number | null;
};

type MuseumProps = {
  entity: MuseumEntity;
  childRooms: Array<{ id: number; name: string }>;
  childArtifacts?: Array<{ id: number; name: string }>;
  museums: Museum[];
  onSave: (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => Promise<void>;
};

type RoomProps = {
  entity: RoomEntity;
  parentMuseum: Museum | null;
  childArtifacts: Array<{ id: number; name: string }>;
  museums: Museum[];
  onSave: (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => Promise<void>;
};

type ArtifactProps = {
  entity: ArtifactEntity;
  parentRoom: Room | null;
  parentMuseum: Museum | null;
  museums: Museum[];
  rooms: Room[];
  onSave: (data: {
    name: string;
    parentId: number | null;
    knowledgeText: string | null;
    furtherReading: string[];
  }) => Promise<void>;
};

type EditPageClientProps = MuseumProps | RoomProps | ArtifactProps;

function isMuseumProps(props: EditPageClientProps): props is MuseumProps {
  return props.entity.type === 'museum';
}

function isRoomProps(props: EditPageClientProps): props is RoomProps {
  return props.entity.type === 'room';
}

function isArtifactProps(props: EditPageClientProps): props is ArtifactProps {
  return props.entity.type === 'artifact';
}

export function EditPageClient(props: EditPageClientProps) {
  // Museum case
  if (isMuseumProps(props)) {
    const newRoomRoute = `/admin/rooms/new?museumId=${props.entity.id}`;
    const newArtifactRoute = `/admin/artifacts/new?museumId=${props.entity.id}`;

    return (
      <div className="space-y-6">
        <EntityDetailsForm
          id={props.entity.id}
          name={props.entity.name}
          knowledgeText={props.entity.knowledgeText}
          furtherReading={props.entity.furtherReading}
        />

        <ChildEntityList
          title="Rooms"
          entities={props.childRooms.map((r) => ({
            id: r.id,
            name: r.name,
            type: 'room' as const,
          }))}
          newEntityRoute={newRoomRoute}
          newEntityLabel="Add Room"
          emptyMessage="No rooms yet."
        />

        {props.childArtifacts && (
          <ChildEntityList
            title="Artifacts"
            entities={props.childArtifacts.map((a) => ({
              id: a.id,
              name: a.name,
              type: 'artifact' as const,
            }))}
            newEntityRoute={newArtifactRoute}
            newEntityLabel="Add Artifact"
            emptyMessage="No artifacts yet."
          />
        )}
      </div>
    );
  }

  // Room case
  if (isRoomProps(props)) {
    const newArtifactRoute = props.parentMuseum
      ? `/admin/artifacts/new?museumId=${props.parentMuseum.id}&roomId=${props.entity.id}`
      : null;

    return (
      <div className="space-y-6">
        <EntityDetailsForm
          id={props.entity.id}
          name={props.entity.name}
          knowledgeText={props.entity.knowledgeText}
          furtherReading={props.entity.furtherReading}
        />

        <div className="space-y-6">
          <ParentSelector
            type="room"
            entityId={props.entity.id}
            currentMuseumId={props.entity.parentId}
            museums={props.museums}
          />
        </div>

        <ChildEntityList
          title="Artifacts"
          entities={props.childArtifacts.map((a) => ({
            id: a.id,
            name: a.name,
            type: 'artifact' as const,
          }))}
          newEntityRoute={newArtifactRoute}
          newEntityLabel="Add Artifact"
          emptyMessage="No artifacts yet."
        />
      </div>
    );
  }

  // Artifact case
  if (isArtifactProps(props)) {
    return (
      <div className="space-y-6">
        <EntityDetailsForm
          id={props.entity.id}
          name={props.entity.name}
          knowledgeText={props.entity.knowledgeText}
          furtherReading={props.entity.furtherReading}
        />

        <div className="space-y-6">
          <ParentSelector
            type="artifact"
            entityId={props.entity.id}
            currentRoomId={props.entity.parentId}
            currentMuseumId={props.parentMuseum?.id ?? null}
            museums={props.museums}
            rooms={props.rooms}
          />
        </div>
      </div>
    );
  }

  return null;
}
