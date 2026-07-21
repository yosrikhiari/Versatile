using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Queries;

public record GetAnnotationsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<AnnotationDto>>, IRequiresOrganization;

public record GetAnnotationByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<AnnotationDto>, IRequiresOrganization;
