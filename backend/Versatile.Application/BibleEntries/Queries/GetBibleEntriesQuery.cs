using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.BibleEntries.Queries;
public record GetBibleEntriesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId, int Page = 1, int PageSize = 20) : IPagedQuery<BibleEntryDto>, IRequiresOrganization;
public record GetBibleEntryByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<BibleEntryDto>, IRequiresOrganization;
