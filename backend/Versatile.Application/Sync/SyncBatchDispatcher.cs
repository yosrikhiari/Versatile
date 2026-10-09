using System.Text.Json;
using FluentValidation;
using MediatR;
using Versatile.Application.Branches.Commands;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Application.DTOs;
using Versatile.Application.Entities.Commands;
using Versatile.Application.Manuscripts.Commands;
using Versatile.Application.PlotThreads.Commands;
using Versatile.Application.ResearchChunks.Commands;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Application.ResearchTags.Commands;
using Versatile.Application.Section.Commands;
using Versatile.Application.Subsection.Commands;
using Versatile.Application.Volume.Commands;
using Versatile.Application.VolumeEntities.Commands;

namespace Versatile.Application.Sync;

/// <summary>
/// Executes sync-batch items through the exact MediatR commands the
/// single-row controllers bind (same handlers, same FluentValidation, same
/// tenant behaviors). Items run sequentially in array order so intra-batch
/// dependencies (a fork after its source branch) hold, and one bad item
/// fails only itself — never the batch.
/// </summary>
public sealed class SyncBatchDispatcher
{
    private static readonly JsonSerializerOptions BatchJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IMediator _mediator;

    public SyncBatchDispatcher(IMediator mediator)
    {
        _mediator = mediator;
    }

    public async Task<List<SyncBatchResultItemDto>> DispatchAsync(
        Guid storyId,
        Guid? organizationId,
        Guid userId,
        IReadOnlyList<SyncBatchItemDto> items,
        CancellationToken cancellationToken = default)
    {
        var results = new List<SyncBatchResultItemDto>(items.Count);
        foreach (var item in items)
        {
            try
            {
                var apiId = await DispatchOneAsync(storyId, organizationId, userId, item, cancellationToken);
                results.Add(new SyncBatchResultItemDto(item.Ref, true, apiId, null));
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex) when (ex is KeyNotFoundException or ValidationException or JsonException or ArgumentException)
            {
                results.Add(new SyncBatchResultItemDto(item.Ref, false, null, ex.Message));
            }
            catch (Exception ex)
            {
                // Never leak internals per item; the row stays pending client-side.
                results.Add(new SyncBatchResultItemDto(item.Ref, false, null, $"Could not sync {item.Table} row ({ex.GetType().Name})."));
            }
        }
        return results;
    }

    private async Task<Guid> DispatchOneAsync(
        Guid storyId,
        Guid? organizationId,
        Guid userId,
        SyncBatchItemDto item,
        CancellationToken cancellationToken)
    {
        var isCreate = item.Action.Equals("create", StringComparison.OrdinalIgnoreCase);
        var isUpdate = item.Action.Equals("update", StringComparison.OrdinalIgnoreCase);
        if (!isCreate && !isUpdate)
            throw new ArgumentException($"Unknown action '{item.Action}'. Use 'create' or 'update'.");

        if (isUpdate && item.ApiId is not { } apiId)
            throw new ArgumentException("Update items require apiId.");

        Guid updateId = isUpdate ? item.ApiId!.Value : Guid.Empty;

        return item.Table switch
        {
            "sections" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateSectionCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "sections" => (await _mediator.Send(
                item.Body.Deserialize<UpdateSectionCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "subsections" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateSubsectionCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "subsections" => (await _mediator.Send(
                item.Body.Deserialize<UpdateSubsectionCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "volumes" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateVolumeCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "volumes" => (await _mediator.Send(
                item.Body.Deserialize<UpdateVolumeCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "volumeEntities" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateVolumeEntityCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "volumeEntities" => (await _mediator.Send(
                item.Body.Deserialize<UpdateVolumeEntityCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "characters" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateEntityCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "characters" => (await _mediator.Send(
                item.Body.Deserialize<UpdateEntityCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "locations" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateEntityCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "locations" => (await _mediator.Send(
                item.Body.Deserialize<UpdateEntityCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "plotThreads" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreatePlotThreadCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "plotThreads" => (await _mediator.Send(
                item.Body.Deserialize<UpdatePlotThreadCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "characterRelationships" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateCharacterRelationshipCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "characterRelationships" => (await _mediator.Send(
                item.Body.Deserialize<UpdateCharacterRelationshipCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "manuscripts" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateManuscriptCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "manuscripts" => (await _mediator.Send(
                item.Body.Deserialize<UpdateManuscriptCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "researchDocuments" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateResearchDocumentCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "researchDocuments" => (await _mediator.Send(
                item.Body.Deserialize<UpdateResearchDocumentCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "researchChunks" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateResearchChunkCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "researchChunks" => (await _mediator.Send(
                item.Body.Deserialize<UpdateResearchChunkCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "researchTags" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateResearchTagCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "researchTags" => (await _mediator.Send(
                item.Body.Deserialize<UpdateResearchTagCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            "branches" when isCreate => (await _mediator.Send(
                item.Body.Deserialize<CreateBranchCommand>(BatchJsonOptions)!
                    with { StoryId = storyId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,
            "branches" => (await _mediator.Send(
                item.Body.Deserialize<UpdateBranchCommand>(BatchJsonOptions)!
                    with { Id = updateId, OrganizationId = organizationId, UserId = userId },
                cancellationToken)).Id,

            _ => throw new ArgumentException($"Table '{item.Table}' is not batchable. Use its own endpoint."),
        };
    }
}
