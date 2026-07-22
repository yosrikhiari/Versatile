using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Queries;

public record GetChaptersQuery(Guid StoryId, Guid? OrganizationId, Guid UserId, int Page = 1, int PageSize = 20) : IPagedQuery<ChapterDto>, IRequiresOrganization;

public record GetChapterByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<ChapterDto>, IRequiresOrganization;
