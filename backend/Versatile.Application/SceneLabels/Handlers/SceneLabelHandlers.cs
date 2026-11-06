using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SceneLabels.Commands;
using Versatile.Application.SceneLabels.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SceneLabels.Handlers;

public class UpsertSceneLabelHandler : IRequestHandler<UpsertSceneLabelCommand, SceneLabelDto>
{
    private readonly IRepository<SceneLabel> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public UpsertSceneLabelHandler(IRepository<SceneLabel> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<SceneLabelDto> Handle(UpsertSceneLabelCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var candidates = await _repo.GetAllAsync(
            l => l.StoryId == request.StoryId
                && l.ReviewerName == request.ReviewerName
                && l.UserId == request.UserId
                && l.OrganizationId == request.OrganizationId, ct);

        SceneLabel? existing = null;
        if (request.SubsectionId.HasValue)
        {
            // Prefer the stable identity. Only unbound legacy labels may be
            // adopted by title: a title fallback must never steal a label that
            // already belongs to a different subsection.
            existing = candidates.FirstOrDefault(l => l.SubsectionId == request.SubsectionId.Value);
            existing ??= candidates.FirstOrDefault(
                l => l.SceneTitle == request.SceneTitle && l.SubsectionId == null);
        }
        else
        {
            existing = candidates.FirstOrDefault(l => l.SceneTitle == request.SceneTitle);
        }

        SceneLabel label;
        if (existing is not null)
        {
            label = existing;
            label.SubsectionId = request.SubsectionId ?? label.SubsectionId;
            label.SceneTitle = request.SceneTitle;
            label.OverallLabel = request.OverallLabel;
            label.DimensionLabels = request.DimensionLabels;
            label.DimensionScores = request.DimensionScores;
            label.Notes = request.Notes;
            label.WordCount = request.WordCount;
            label.SceneExcerpt = request.SceneExcerpt;
            label.UpdatedAt = DateTime.UtcNow;
            _repo.Update(label);
        }
        else
        {
            label = new SceneLabel
            {
                StoryId = request.StoryId,
                SubsectionId = request.SubsectionId,
                SceneTitle = request.SceneTitle,
                ReviewerName = request.ReviewerName,
                OverallLabel = request.OverallLabel,
                DimensionLabels = request.DimensionLabels,
                DimensionScores = request.DimensionScores,
                Notes = request.Notes,
                WordCount = request.WordCount,
                SceneExcerpt = request.SceneExcerpt,
                UserId = request.UserId,
                OrganizationId = request.OrganizationId
            };
            await _repo.AddAsync(label, ct);
        }

        await _uow.SaveChangesAsync(ct);
        return ToDto(label);
    }

    public static SceneLabelDto ToDto(SceneLabel l) => new(
        l.Id, l.StoryId, l.SubsectionId, l.SceneTitle, l.ReviewerName, l.OverallLabel,
        l.DimensionLabels, l.DimensionScores, l.Notes, l.WordCount, l.SceneExcerpt, l.CreatedAt);
}

public class DeleteSceneLabelHandler : IRequestHandler<DeleteSceneLabelCommand, bool>
{
    private readonly IRepository<SceneLabel> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteSceneLabelHandler(IRepository<SceneLabel> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<bool> Handle(DeleteSceneLabelCommand request, CancellationToken ct)
    {
        var existing = await _repo.GetAllAsync(
            l => l.Id == request.Id && l.UserId == request.UserId && l.OrganizationId == request.OrganizationId, ct);
        if (existing.Count == 0) throw new KeyNotFoundException("Label not found");
        _repo.Delete(existing[0]);
        await _uow.SaveChangesAsync(ct);
        return true;
    }
}

public class GetSceneLabelsHandler : IRequestHandler<GetSceneLabelsQuery, List<SceneLabelDto>>
{
    private readonly IRepository<SceneLabel> _repo;

    public GetSceneLabelsHandler(IRepository<SceneLabel> repo) => _repo = repo;

    public async Task<List<SceneLabelDto>> Handle(GetSceneLabelsQuery request, CancellationToken ct)
    {
        var labels = await _repo.GetAllAsync(
            l => l.OrganizationId == request.OrganizationId
                && l.UserId == request.UserId
                && (request.StoryId == null || l.StoryId == request.StoryId)
                && (request.ReviewerName == null || l.ReviewerName == request.ReviewerName), ct);
        return labels.Select(UpsertSceneLabelHandler.ToDto).ToList();
    }
}

public class GetSceneLabelByIdHandler : IRequestHandler<GetSceneLabelByIdQuery, SceneLabelDto>
{
    private readonly IRepository<SceneLabel> _repo;

    public GetSceneLabelByIdHandler(IRepository<SceneLabel> repo) => _repo = repo;

    public async Task<SceneLabelDto> Handle(GetSceneLabelByIdQuery request, CancellationToken ct)
    {
        var labels = await _repo.GetAllAsync(
            l => l.Id == request.Id
                && l.OrganizationId == request.OrganizationId
                && l.UserId == request.UserId, ct);
        if (labels.Count == 0) throw new KeyNotFoundException("Label not found");
        return UpsertSceneLabelHandler.ToDto(labels[0]);
    }
}
