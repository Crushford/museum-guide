'use client';

import { useState } from 'react';
import { EntityDetailsForm } from './EntityDetailsForm';
import { ParentSelector } from './ParentSelector';
import { ChildEntityList } from './ChildEntityList';
import { SectionCard } from '@/components/shared/SectionCard';
import { MuseumDisplay } from './MuseumDisplay';
import { RoomDisplay } from './RoomDisplay';
import { Button } from '@/components/ui/button';
import { Museum, Room } from '@/lib/types';

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
  parentId: number | null; // museumId if parent room, null if child room
  parentRoomId?: number | null; // parentRoomId if child room
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
};

type RoomProps = {
  entity: RoomEntity;
  parentMuseum: Museum | null;
  parentRooms?: Room[];
  childRooms: Array<{ id: number; name: string; museum?: string | null }>;
  childArtifacts: Array<{ id: number; name: string; museum?: string | null }>;
  allArtifacts?: Array<{
    id: number;
    name: string;
    museum?: string | null;
  }>; // All artifacts including from child rooms
  museums: Museum[];
};

type ArtifactProps = {
  entity: ArtifactEntity;
  parentRoom: Room | null;
  parentParentRoom?: Room | null; // Parent room's parent room (if exists)
  parentMuseum: Museum | null;
  museums: Museum[];
  rooms: Room[];
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
  // Room edit state - only used for room type
  const [isEditingRoom, setIsEditingRoom] = useState(false);

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
    const newChildRoomRoute = props.parentMuseum
      ? `/admin/rooms/new?museumId=${props.parentMuseum.id}`
      : null;

    // Show child rooms if this room has children
    const hasChildRooms = props.childRooms.length > 0;

    const handleCancel = () => {
      setIsEditingRoom(false);
    };

    return (
      <SectionCard
        title="Room Details"
        actions={
          !isEditingRoom ? (
            <Button onClick={() => setIsEditingRoom(true)} size="sm">
              Edit
            </Button>
          ) : (
            <Button onClick={handleCancel} size="sm" variant="secondary">
              Cancel
            </Button>
          )
        }
      >
        <div className="space-y-6">
          {/* Details Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary">Details</h3>
            <EntityDetailsForm
              id={props.entity.id}
              name={props.entity.name}
              knowledgeText={props.entity.knowledgeText}
              furtherReading={props.entity.furtherReading}
              isEditing={isEditingRoom}
            />
          </div>

          {/* Parent Section (Museum or Parent Room) */}
          <div className="border-t border-border pt-6 space-y-4">
            <h3 className="text-sm font-semibold text-primary">
              {props.entity.parentRoomId ? 'Parent Room' : 'Museum'}
            </h3>
            <ParentSelector
              type="room"
              entityId={props.entity.id}
              currentMuseumId={props.entity.parentId}
              currentParentRoomId={props.entity.parentRoomId ?? null}
              museums={props.museums}
              parentRooms={props.parentRooms}
              parentMuseum={props.parentMuseum}
              isEditing={isEditingRoom}
              onEditChange={setIsEditingRoom}
            />
          </div>

          {/* Child Rooms */}
          {hasChildRooms && (
            <div className="border-t border-border pt-6">
              <ChildEntityList
                title="Child Rooms"
                entities={props.childRooms.map((r) => ({
                  id: r.id,
                  name: r.name,
                  type: 'room' as const,
                  museum: r.museum,
                }))}
                newEntityRoute={newChildRoomRoute}
                newEntityLabel="Add Child Room"
                emptyMessage="No child rooms yet."
              />
            </div>
          )}

          {/* Artifacts - includes artifacts from child rooms if this is a parent room */}
          <div
            className={`${hasChildRooms ? 'border-t border-border pt-6' : ''}`}
          >
            <ChildEntityList
              title="Artifacts"
              subtitle={
                hasChildRooms && props.allArtifacts
                  ? 'Includes artifacts from child rooms'
                  : undefined
              }
              entities={
                hasChildRooms && props.allArtifacts
                  ? props.allArtifacts.map((a) => ({
                      id: a.id,
                      name: a.name,
                      type: 'artifact' as const,
                      museum: a.museum,
                    }))
                  : props.childArtifacts.map((a) => ({
                      id: a.id,
                      name: a.name,
                      type: 'artifact' as const,
                      museum: a.museum,
                    }))
              }
              newEntityRoute={newArtifactRoute}
              newEntityLabel="Add Artifact"
              emptyMessage="No artifacts yet."
              inline={true}
            />
          </div>
        </div>
      </SectionCard>
    );
  }

  // Artifact case
  if (isArtifactProps(props)) {
    return (
      <SectionCard>
        <div className="space-y-6">
          <EntityDetailsForm
            id={props.entity.id}
            name={props.entity.name}
            knowledgeText={props.entity.knowledgeText}
            furtherReading={props.entity.furtherReading}
          />

          <RoomDisplay
            artifactId={props.entity.id}
            currentRoomId={props.entity.parentId}
            currentMuseumId={props.parentMuseum?.id ?? null}
            rooms={props.rooms}
            parentParentRoom={props.parentParentRoom}
          />

          <MuseumDisplay
            artifactId={props.entity.id}
            currentMuseum={props.parentMuseum}
            currentRoomId={props.entity.parentId}
            museums={props.museums}
            rooms={props.rooms}
            allowEdit={false}
          />
        </div>
      </SectionCard>
    );
  }

  return null;
}
