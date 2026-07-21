using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Handlers;

public class CreateSceneHandler : IRequestHandler<CreateSceneCommand, SceneDto>
{
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IRepository<Scene> _scenes;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSceneHandler(
        IOrganizationOwnedRepository<Chapter> chapters,
        IRepository<Scene> scenes,
        IUnitOfWork unitOfWork)
    {
        _chapters = chapters;
        _scenes = scenes;
        _unitOfWork = unitOfWork;
    }

    public async Task<SceneDto> Handle(CreateSceneCommand request, CancellationToken ct)
    {
        var chapter = await _chapters.GetByIdForOrganizationAsync(request.ChapterId, request.OrganizationId!.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Chapter not found");

        var existing = await _scenes.GetAllAsync(s => s.ChapterId == request.ChapterId, ct);
        var maxOrder = existing.Count > 0 ? existing.Max(s => s.Order) : 0;

        var scene = new Scene
        {
            ChapterId = request.ChapterId,
            Title = request.Title,
            Content = request.Content,
            Order = request.Order > 0 ? request.Order : maxOrder + 1,
            WordCount = CountWords(request.Content),
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _scenes.AddAsync(scene, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(scene);
    }

    private static int CountWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static SceneDto ToDto(Scene s) => new(
        s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt
    );
}
